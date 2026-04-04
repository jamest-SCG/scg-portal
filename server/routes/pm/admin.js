const express = require('express');
const multer = require('multer');
const { queryAll, queryOne, run, runBatch, getActiveCycle, getActiveCycleMonths } = require('../../db');
const { parseFoundationCSV } = require('../../parsers/foundation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/pm/admin/import - upload & preview Foundation CSV files (batch)
router.post('/import', upload.array('files', 50), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const content = file.buffer.toString('utf-8');
        const parsed = parseFoundationCSV(content);

        if (!parsed.job_no) {
          errors.push({ filename: file.originalname, error: 'Could not extract job number.' });
          continue;
        }

        // Check if job already exists
        const existing = queryOne('SELECT job_no, pm, division FROM jobs WHERE job_no = ?', [parsed.job_no]);

        results.push({
          filename: file.originalname,
          job_no: parsed.job_no,
          job_name: parsed.job_name || 'Unknown',
          cost_code_count: parsed.cost_codes.length,
          contract: parsed.footer.total_revised_contract,
          left_to_bill: parsed.footer.left_to_bill,
          client_name: parsed.footer.client_name,
          is_new: !existing,
          existing_pm: existing ? existing.pm : null,
          existing_division: existing ? existing.division : null,
          parsed,
        });
      } catch (err) {
        errors.push({ filename: file.originalname, error: err.message });
      }
    }

    res.json({
      preview: true,
      files: results.map(r => ({
        filename: r.filename,
        job_no: r.job_no,
        job_name: r.job_name,
        cost_code_count: r.cost_code_count,
        contract: r.contract,
        left_to_bill: r.left_to_bill,
        client_name: r.client_name,
        is_new: r.is_new,
        existing_pm: r.existing_pm,
        existing_division: r.existing_division,
      })),
      new_count: results.filter(r => r.is_new).length,
      update_count: results.filter(r => !r.is_new).length,
      error_count: errors.length,
      errors,
      data: results.map(r => r.parsed),
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to parse files: ' + err.message });
  }
});

// POST /api/pm/admin/import/confirm - import Foundation data with two-phase logic
router.post('/import/confirm', (req, res) => {
  try {
    const { data, assignments } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data to import.' });
    }

    const cycle = getActiveCycle();
    if (!cycle) return res.status(500).json({ error: 'No active billing cycle.' });
    const months = JSON.parse(cycle.months);

    const now = new Date().toISOString();
    const statements = [];
    let newCount = 0;
    let updateCount = 0;

    for (const parsed of data) {
      if (!parsed.job_no) continue;

      const jobNo = parsed.job_no.trim();
      const existing = queryOne('SELECT job_no FROM jobs WHERE job_no = ?', [jobNo]);
      const assignment = (assignments || {})[jobNo] || {};

      const footer = parsed.footer || {};
      const totals = parsed.totals || {};
      const contract = footer.total_revised_contract || 0;
      const billed = footer.billed_to_date || 0;
      const remaining = footer.left_to_bill || 0;
      const estCost = totals.revised_est_cost || 0;
      const costToDate = totals.costs_to_date || 0;
      const pctComplete = contract > 0 ? billed / contract : 0;

      if (!existing) {
        // NEW JOB — insert everything
        const pm = assignment.pm || '';
        const division = assignment.division || '';

        statements.push([
          `INSERT INTO jobs (job_no, job_name, division, pm, contract, est_cost, cost_to_date, billed, remaining, pct_complete, client_name, change_orders, import_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [jobNo, parsed.job_name || '', division, pm, contract, estCost, costToDate, billed, remaining, pctComplete, footer.client_name || '', footer.change_orders || 0, now]
        ]);

        // Insert blank submission row for active cycle
        statements.push([
          'INSERT OR IGNORE INTO submissions (job_no, cycle_id, pm, last_updated) VALUES (?, ?, ?, ?)',
          [jobNo, cycle.id, pm, now]
        ]);

        // Insert blank billing entries for active cycle
        for (const m of months) {
          statements.push([
            'INSERT OR IGNORE INTO billing_entries (cycle_id, job_no, month_key, amount) VALUES (?, ?, ?, 0)',
            [cycle.id, jobNo, m.key]
          ]);
        }

        // Insert all cost codes
        for (const cc of parsed.cost_codes) {
          statements.push([
            `INSERT INTO job_cost_codes (job_no, cost_code_no, description, original_est, approved_cos, revised_est_cost, costs_to_date, remaining_budget, remaining_committed_cost, projected_over_under, pct_variance, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobNo, cc.cost_code_no, cc.description, cc.original_est, cc.approved_cos, cc.revised_est_cost, cc.costs_to_date, cc.remaining_budget, cc.remaining_committed_cost, cc.projected_over_under, cc.pct_variance, now]
          ]);
        }

        newCount++;
      } else {
        // EXISTING JOB — update actuals only, preserve PM/division/submissions
        statements.push([
          `UPDATE jobs SET contract = ?, est_cost = ?, cost_to_date = ?, billed = ?, remaining = ?, pct_complete = ?, client_name = ?, change_orders = ?, import_date = ?
           WHERE job_no = ?`,
          [contract, estCost, costToDate, billed, remaining, pctComplete, footer.client_name || '', footer.change_orders || 0, now, jobNo]
        ]);

        // Upsert cost codes — update actuals, preserve PM estimates
        for (const cc of parsed.cost_codes) {
          statements.push([
            `INSERT INTO job_cost_codes (job_no, cost_code_no, description, original_est, approved_cos, revised_est_cost, costs_to_date, remaining_budget, remaining_committed_cost, projected_over_under, pct_variance, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(job_no, cost_code_no) DO UPDATE SET
               description = excluded.description,
               costs_to_date = excluded.costs_to_date,
               remaining_budget = excluded.remaining_budget,
               remaining_committed_cost = excluded.remaining_committed_cost,
               projected_over_under = excluded.projected_over_under,
               pct_variance = excluded.pct_variance,
               original_est = CASE WHEN job_cost_codes.original_est = 0 OR job_cost_codes.original_est IS NULL THEN excluded.original_est ELSE job_cost_codes.original_est END,
               approved_cos = CASE WHEN job_cost_codes.approved_cos = 0 OR job_cost_codes.approved_cos IS NULL THEN excluded.approved_cos ELSE job_cost_codes.approved_cos END,
               revised_est_cost = CASE WHEN job_cost_codes.revised_est_cost = 0 OR job_cost_codes.revised_est_cost IS NULL THEN excluded.revised_est_cost ELSE job_cost_codes.revised_est_cost END,
               last_updated = excluded.last_updated`,
            [jobNo, cc.cost_code_no, cc.description, cc.original_est, cc.approved_cos, cc.revised_est_cost, cc.costs_to_date, cc.remaining_budget, cc.remaining_committed_cost, cc.projected_over_under, cc.pct_variance, now]
          ]);
        }

        updateCount++;
      }
    }

    runBatch(statements);

    // Revalidate schedules for unsubmitted jobs — remaining may have changed
    const allSubs = queryAll(`
      SELECT s.job_no, j.remaining
      FROM submissions s
      JOIN jobs j ON s.job_no = j.job_no
      WHERE s.cycle_id = ? AND s.submitted_at IS NULL
    `, [cycle.id]);
    for (const sub of allSubs) {
      const entries = queryAll(
        'SELECT amount FROM billing_entries WHERE cycle_id = ? AND job_no = ?',
        [cycle.id, sub.job_no]
      );
      const sum = entries.reduce((acc, e) => acc + (e.amount || 0), 0);
      const rem = sub.remaining || 0;
      const valid = (Math.abs(rem) <= 0.01) || (rem > 0.01 && sum >= rem - 0.01) ? 1 : 0;
      run('UPDATE submissions SET schedule_valid = ? WHERE job_no = ? AND cycle_id = ?', [valid, sub.job_no, cycle.id]);
    }

    res.json({
      message: `Import complete. ${newCount} new job${newCount !== 1 ? 's' : ''}, ${updateCount} updated.`,
      new_count: newCount,
      update_count: updateCount,
      import_date: now,
    });
  } catch (err) {
    console.error('Import confirm error:', err);
    res.status(500).json({ error: 'Failed to import: ' + err.message });
  }
});

// GET /api/pm/admin/export - export submissions as CSV
router.get('/export', (req, res) => {
  const cycle = getActiveCycle();
  if (!cycle) return res.status(500).json({ error: 'No active billing cycle.' });
  const months = JSON.parse(cycle.months);
  const includeNotes = req.query.notes === 'true';

  const jobs = queryAll('SELECT job_no FROM jobs ORDER BY job_no');
  const submissions = queryAll('SELECT job_no, ctc_override, notes FROM submissions WHERE cycle_id = ?', [cycle.id]);
  const subMap = {};
  for (const s of submissions) subMap[s.job_no] = s;

  const entries = queryAll('SELECT job_no, month_key, amount FROM billing_entries WHERE cycle_id = ?', [cycle.id]);
  const entryMap = {};
  for (const e of entries) {
    if (!entryMap[e.job_no]) entryMap[e.job_no] = {};
    entryMap[e.job_no][e.month_key] = e.amount;
  }

  let headers = ['job_no', ...months.map(m => m.key), 'ctc_override'];
  if (includeNotes) headers.push('notes');

  const csvRows = [headers.join(',')];
  const fmtVal = (v) => v !== null && v !== undefined ? v : 0;

  for (const job of jobs) {
    const sub = subMap[job.job_no] || {};
    const jobEntries = entryMap[job.job_no] || {};
    const vals = [
      job.job_no,
      ...months.map(m => fmtVal(jobEntries[m.key])),
      fmtVal(sub.ctc_override),
    ];
    if (includeNotes) {
      vals.push(sub.notes ? `"${sub.notes.replace(/"/g, '""')}"` : '');
    }
    csvRows.push(vals.join(','));
  }

  const date = new Date().toISOString().split('T')[0];
  const filename = `SCG_PM_Submissions_${date}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvRows.join('\n'));
});

// POST /api/pm/admin/new-cycle - create a new billing cycle
router.post('/new-cycle', (req, res) => {
  const { name, months } = req.body;

  // If no params provided, just unlock the current cycle (backward compat)
  if (!name && !months) {
    const cycle = getActiveCycle();
    if (cycle) {
      run('UPDATE submissions SET submitted_at = NULL WHERE cycle_id = ?', [cycle.id]);
    }
    return res.json({ message: 'All submissions unlocked for editing.' });
  }

  // Validate
  if (!name || !months || !Array.isArray(months) || months.length === 0) {
    return res.status(400).json({ error: 'Cycle name and months array are required.' });
  }

  const now = new Date().toISOString();

  // Archive current active cycle
  run('UPDATE billing_cycles SET is_active = 0, archived_at = ? WHERE is_active = 1', [now]);

  // Create new cycle
  const monthsJson = JSON.stringify(months);
  run('INSERT INTO billing_cycles (name, months, is_active, created_at) VALUES (?, ?, 1, ?)', [name, monthsJson, now]);

  const newCycle = queryOne('SELECT id FROM billing_cycles WHERE is_active = 1');

  // Create blank submissions and billing entries for all jobs
  const jobs = queryAll('SELECT job_no, pm FROM jobs WHERE pm IS NOT NULL AND pm != ""');
  for (const job of jobs) {
    run('INSERT OR IGNORE INTO submissions (job_no, cycle_id, pm, last_updated) VALUES (?, ?, ?, ?)', [job.job_no, newCycle.id, job.pm, now]);
    for (const m of months) {
      run('INSERT OR IGNORE INTO billing_entries (cycle_id, job_no, month_key, amount) VALUES (?, ?, ?, 0)', [newCycle.id, job.job_no, m.key]);
    }
  }

  res.json({ message: `New cycle "${name}" created with ${months.length} months. ${jobs.length} jobs initialized.` });
});

// POST /api/pm/admin/unlock/:jobNo - unlock a single submitted job
router.post('/unlock/:jobNo', (req, res) => {
  const { jobNo } = req.params;
  const cycle = getActiveCycle();
  if (!cycle) return res.status(500).json({ error: 'No active billing cycle.' });

  const submission = queryOne('SELECT submitted_at FROM submissions WHERE job_no = ? AND cycle_id = ?', [jobNo, cycle.id]);
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found.' });
  }
  if (!submission.submitted_at) {
    return res.status(400).json({ error: 'This job is not submitted.' });
  }
  run('UPDATE submissions SET submitted_at = NULL WHERE job_no = ? AND cycle_id = ?', [jobNo, cycle.id]);
  res.json({ message: `Job ${jobNo} unlocked for editing.` });
});

// GET /api/pm/admin/incomplete - jobs where PM has not submitted or schedule_valid = false
router.get('/incomplete', (req, res) => {
  const cycle = getActiveCycle();
  if (!cycle) return res.json([]);

  const jobs = queryAll(`
    SELECT j.job_no, j.job_name, j.pm, s.schedule_valid, s.submitted_at
    FROM jobs j
    LEFT JOIN submissions s ON j.job_no = s.job_no AND s.cycle_id = ?
    WHERE j.pm IS NOT NULL AND j.pm != 'TBD' AND j.pm != ''
      AND (s.submitted_at IS NULL OR s.schedule_valid = 0 OR s.schedule_valid IS NULL)
    ORDER BY j.pm, j.job_no
  `, [cycle.id]);
  res.json(jobs);
});

module.exports = router;
