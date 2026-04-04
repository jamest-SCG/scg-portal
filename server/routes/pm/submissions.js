const express = require('express');
const { queryAll, queryOne, run, getActiveCycle, getActiveCycleMonths } = require('../../db');

const router = express.Router();

// Helper: create a blank submission + billing entries for a job
function createBlankSubmission(cycleId, jobNo, pm, months, now) {
  run(
    'INSERT INTO submissions (job_no, cycle_id, pm, schedule_valid, last_updated) VALUES (?, ?, ?, 1, ?)',
    [jobNo, cycleId, pm, now]
  );
  for (const m of months) {
    run(
      'INSERT OR IGNORE INTO billing_entries (cycle_id, job_no, month_key, amount) VALUES (?, ?, ?, 0)',
      [cycleId, jobNo, m.key]
    );
  }
}

// PUT /api/pm/submissions/:jobNo - auto-save a single job submission
router.put('/:jobNo', (req, res) => {
  const { jobNo } = req.params;
  const cycle = getActiveCycle();
  if (!cycle) return res.status(500).json({ error: 'No active billing cycle.' });
  const months = JSON.parse(cycle.months);

  // Enforce PM data isolation
  if (req.user.role !== 'admin') {
    const job = queryOne('SELECT pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (!job || job.pm !== req.user.initials) {
      return res.status(403).json({ error: 'Not authorized for this job.' });
    }
  }

  // Check if already submitted (locked)
  const existing = queryOne('SELECT submitted_at FROM submissions WHERE job_no = ? AND cycle_id = ?', [jobNo, cycle.id]);
  if (existing && existing.submitted_at) {
    return res.status(400).json({ error: 'This job has already been submitted. Contact admin to unlock.' });
  }

  const { ctc_override, notes } = req.body;

  // Save billing entries
  let sum = 0;
  for (const m of months) {
    const amount = parseFloat(req.body[m.key]) || 0;
    sum += amount;
    run(
      'INSERT INTO billing_entries (cycle_id, job_no, month_key, amount) VALUES (?, ?, ?, ?) ON CONFLICT(cycle_id, job_no, month_key) DO UPDATE SET amount = ?',
      [cycle.id, jobNo, m.key, amount, amount]
    );
  }

  // Calculate schedule_valid
  const job = queryOne('SELECT remaining FROM jobs WHERE job_no = ?', [jobNo]);
  const remaining = job ? (job.remaining || 0) : 0;
  const schedule_valid = (Math.abs(remaining) <= 0.01) || (remaining > 0.01 && sum >= remaining - 0.01) ? 1 : 0;

  const now = new Date().toISOString();
  const ctcVal = ctc_override !== null && ctc_override !== undefined && ctc_override !== ''
    ? parseFloat(ctc_override)
    : null;

  run(`
    INSERT INTO submissions (job_no, cycle_id, pm, ctc_override, schedule_valid, last_updated, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_no, cycle_id) DO UPDATE SET
      ctc_override = excluded.ctc_override,
      schedule_valid = excluded.schedule_valid,
      last_updated = excluded.last_updated,
      notes = excluded.notes
  `, [jobNo, cycle.id, req.user.initials, ctcVal, schedule_valid, now, notes ? notes.substring(0, 500) : null]);

  res.json({ schedule_valid, last_updated: now });
});

// POST /api/pm/submissions/submit/:jobNo - submit a single job
router.post('/submit/:jobNo', (req, res) => {
  const { jobNo } = req.params;
  const cycle = getActiveCycle();
  if (!cycle) return res.status(500).json({ error: 'No active billing cycle.' });
  const months = JSON.parse(cycle.months);

  // Enforce PM data isolation
  if (req.user.role !== 'admin') {
    const job = queryOne('SELECT pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (!job || job.pm !== req.user.initials) {
      return res.status(403).json({ error: 'Not authorized for this job.' });
    }
  }

  let submission = queryOne('SELECT schedule_valid, submitted_at FROM submissions WHERE job_no = ? AND cycle_id = ?', [jobNo, cycle.id]);

  // If no submission record exists but remaining is $0, auto-create
  if (!submission) {
    const job = queryOne('SELECT remaining, pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (job && (job.remaining || 0) <= 0.01) {
      const now = new Date().toISOString();
      createBlankSubmission(cycle.id, jobNo, job.pm || req.user.initials, months, now);
      submission = queryOne('SELECT schedule_valid, submitted_at FROM submissions WHERE job_no = ? AND cycle_id = ?', [jobNo, cycle.id]);
    } else {
      return res.status(400).json({ error: 'No submission data found for this job.' });
    }
  }

  if (submission.submitted_at) {
    return res.status(400).json({ error: 'This job has already been submitted.' });
  }
  if (!submission.schedule_valid) {
    return res.status(400).json({ error: 'Billing schedule must be valid before submitting.' });
  }

  const now = new Date().toISOString();
  run('UPDATE submissions SET submitted_at = ? WHERE job_no = ? AND cycle_id = ?', [now, jobNo, cycle.id]);

  res.json({
    message: 'Job submitted successfully.',
    job_no: jobNo,
    submitted_at: now,
  });
});

// POST /api/pm/submissions/submit-all - submit all jobs for the logged-in PM
router.post('/submit-all', (req, res) => {
  const pm = req.user.initials;
  const cycle = getActiveCycle();
  if (!cycle) return res.status(500).json({ error: 'No active billing cycle.' });
  const months = JSON.parse(cycle.months);
  const now = new Date().toISOString();

  // Auto-create submission records for jobs with $0 remaining that have none
  const missingSubmissions = queryAll(`
    SELECT j.job_no, j.pm FROM jobs j
    LEFT JOIN submissions s ON j.job_no = s.job_no AND s.cycle_id = ?
    WHERE j.pm = ? AND s.job_no IS NULL AND (j.remaining IS NULL OR j.remaining <= 0.01)
  `, [cycle.id, pm]);
  for (const j of missingSubmissions) {
    createBlankSubmission(cycle.id, j.job_no, j.pm || pm, months, now);
  }

  const jobs = queryAll(`
    SELECT j.job_no, s.schedule_valid, s.submitted_at
    FROM jobs j
    LEFT JOIN submissions s ON j.job_no = s.job_no AND s.cycle_id = ?
    WHERE j.pm = ?
  `, [cycle.id, pm]);

  const notValid = jobs.filter(j => !j.schedule_valid);
  if (notValid.length > 0) {
    return res.status(400).json({
      error: 'All jobs must have valid billing schedules before submitting.',
      notValid: notValid.map(j => j.job_no),
    });
  }

  for (const j of jobs) {
    if (!j.submitted_at) {
      run('UPDATE submissions SET submitted_at = ? WHERE job_no = ? AND cycle_id = ?', [now, j.job_no, cycle.id]);
    }
  }

  res.json({
    message: 'All jobs submitted successfully.',
    count: jobs.length,
    submitted_at: now,
  });
});

// GET /api/pm/submissions/status - submission status
router.get('/status', (req, res) => {
  const cycle = getActiveCycle();
  if (!cycle) return res.json([]);
  const isPMAdmin = req.user.role === 'admin' || (req.user.apps && req.user.apps.includes('pm_admin'));

  if (!isPMAdmin) {
    const stats = queryOne(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN s.submitted_at IS NOT NULL THEN 1 ELSE 0 END) as submitted_count,
        SUM(CASE WHEN s.schedule_valid = 1 THEN 1 ELSE 0 END) as valid_count,
        MAX(s.last_updated) as last_activity
      FROM jobs j
      LEFT JOIN submissions s ON j.job_no = s.job_no AND s.cycle_id = ?
      WHERE j.pm = ?
    `, [cycle.id, req.user.initials]);
    return res.json(stats || { total_jobs: 0, submitted_count: 0, valid_count: 0, last_activity: null });
  }

  const pmStats = queryAll(`
    SELECT
      j.pm,
      COUNT(*) as total_jobs,
      SUM(CASE WHEN s.submitted_at IS NOT NULL THEN 1 ELSE 0 END) as submitted_count,
      SUM(CASE WHEN s.schedule_valid = 1 THEN 1 ELSE 0 END) as valid_count,
      MAX(s.last_updated) as last_activity
    FROM jobs j
    LEFT JOIN submissions s ON j.job_no = s.job_no AND s.cycle_id = ?
    WHERE j.pm IS NOT NULL AND j.pm != 'TBD'
    GROUP BY j.pm
    ORDER BY j.pm
  `, [cycle.id]);
  res.json(pmStats);
});

module.exports = router;
