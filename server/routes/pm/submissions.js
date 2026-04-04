const express = require('express');
const { queryAll, queryOne, run } = require('../../db');

const router = express.Router();

// PUT /api/pm/submissions/:jobNo - auto-save a single job submission
router.put('/:jobNo', (req, res) => {
  const { jobNo } = req.params;

  // Enforce PM data isolation
  if (req.user.role !== 'admin') {
    const job = queryOne('SELECT pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (!job || job.pm !== req.user.initials) {
      return res.status(403).json({ error: 'Not authorized for this job.' });
    }
  }

  // Check if already submitted (locked)
  const existing = queryOne('SELECT submitted_at FROM submissions WHERE job_no = ?', [jobNo]);
  if (existing && existing.submitted_at) {
    return res.status(400).json({ error: 'This job has already been submitted. Contact admin to unlock.' });
  }

  const {
    feb_26, mar_26, apr_26, may_26, jun_26, jul_26,
    aug_26, sep_26, oct_26, nov_26, dec_26,
    ctc_override, notes
  } = req.body;

  // Calculate schedule_valid: monthly sum must be >= remaining to bill
  const job = queryOne('SELECT remaining FROM jobs WHERE job_no = ?', [jobNo]);
  const monthValues = [feb_26, mar_26, apr_26, may_26, jun_26, jul_26, aug_26, sep_26, oct_26, nov_26, dec_26];
  const sum = monthValues.reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
  const remaining = job ? (job.remaining || 0) : 0;
  const schedule_valid = (Math.abs(remaining) <= 0.01) || (remaining > 0.01 && sum >= remaining - 0.01) ? 1 : 0;

  const now = new Date().toISOString();

  const ctcVal = ctc_override !== null && ctc_override !== undefined && ctc_override !== ''
    ? parseFloat(ctc_override)
    : null;

  run(`
    INSERT INTO submissions (job_no, pm, feb_26, mar_26, apr_26, may_26, jun_26, jul_26,
      aug_26, sep_26, oct_26, nov_26, dec_26, ctc_override, schedule_valid, last_updated, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_no) DO UPDATE SET
      feb_26 = excluded.feb_26,
      mar_26 = excluded.mar_26,
      apr_26 = excluded.apr_26,
      may_26 = excluded.may_26,
      jun_26 = excluded.jun_26,
      jul_26 = excluded.jul_26,
      aug_26 = excluded.aug_26,
      sep_26 = excluded.sep_26,
      oct_26 = excluded.oct_26,
      nov_26 = excluded.nov_26,
      dec_26 = excluded.dec_26,
      ctc_override = excluded.ctc_override,
      schedule_valid = excluded.schedule_valid,
      last_updated = excluded.last_updated,
      notes = excluded.notes
  `, [
    jobNo, req.user.initials,
    parseFloat(feb_26) || 0, parseFloat(mar_26) || 0, parseFloat(apr_26) || 0,
    parseFloat(may_26) || 0, parseFloat(jun_26) || 0, parseFloat(jul_26) || 0,
    parseFloat(aug_26) || 0, parseFloat(sep_26) || 0, parseFloat(oct_26) || 0,
    parseFloat(nov_26) || 0, parseFloat(dec_26) || 0,
    ctcVal, schedule_valid, now,
    notes ? notes.substring(0, 500) : null
  ]);

  res.json({ schedule_valid, last_updated: now });
});

// POST /api/pm/submissions/submit/:jobNo - submit a single job
router.post('/submit/:jobNo', (req, res) => {
  const { jobNo } = req.params;

  // Enforce PM data isolation
  if (req.user.role !== 'admin') {
    const job = queryOne('SELECT pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (!job || job.pm !== req.user.initials) {
      return res.status(403).json({ error: 'Not authorized for this job.' });
    }
  }

  let submission = queryOne('SELECT schedule_valid, submitted_at FROM submissions WHERE job_no = ?', [jobNo]);

  // If no submission record exists but remaining is $0, auto-create a valid submission
  if (!submission) {
    const job = queryOne('SELECT remaining, pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (job && (job.remaining || 0) <= 0.01) {
      const now = new Date().toISOString();
      run(`INSERT INTO submissions (job_no, pm, feb_26, mar_26, apr_26, may_26, jun_26, jul_26,
        aug_26, sep_26, oct_26, nov_26, dec_26, ctc_override, schedule_valid, last_updated, notes)
        VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, 1, ?, NULL)`,
        [jobNo, job.pm || req.user.initials, now]);
      submission = queryOne('SELECT schedule_valid, submitted_at FROM submissions WHERE job_no = ?', [jobNo]);
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
  run('UPDATE submissions SET submitted_at = ? WHERE job_no = ?', [now, jobNo]);

  res.json({
    message: 'Job submitted successfully.',
    job_no: jobNo,
    submitted_at: now,
  });
});

// POST /api/pm/submissions/submit-all - submit all jobs for the logged-in PM
router.post('/submit-all', (req, res) => {
  const pm = req.user.initials;

  const jobs = queryAll(`
    SELECT j.job_no, s.schedule_valid, s.submitted_at
    FROM jobs j
    LEFT JOIN submissions s ON j.job_no = s.job_no
    WHERE j.pm = ?
  `, [pm]);

  const notValid = jobs.filter(j => !j.schedule_valid);
  if (notValid.length > 0) {
    return res.status(400).json({
      error: 'All jobs must have valid billing schedules before submitting.',
      notValid: notValid.map(j => j.job_no),
    });
  }

  const now = new Date().toISOString();
  for (const j of jobs) {
    if (!j.submitted_at) {
      run('UPDATE submissions SET submitted_at = ? WHERE job_no = ?', [now, j.job_no]);
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
  const isPMAdmin = req.user.role === 'admin' || (req.user.apps && req.user.apps.includes('pm_admin'));

  if (!isPMAdmin) {
    const stats = queryOne(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN s.submitted_at IS NOT NULL THEN 1 ELSE 0 END) as submitted_count,
        SUM(CASE WHEN s.schedule_valid = 1 THEN 1 ELSE 0 END) as valid_count,
        MAX(s.last_updated) as last_activity
      FROM jobs j
      LEFT JOIN submissions s ON j.job_no = s.job_no
      WHERE j.pm = ?
    `, [req.user.initials]);
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
    LEFT JOIN submissions s ON j.job_no = s.job_no
    WHERE j.pm IS NOT NULL AND j.pm != 'TBD'
    GROUP BY j.pm
    ORDER BY j.pm
  `);
  res.json(pmStats);
});

module.exports = router;
