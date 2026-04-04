const express = require('express');
const { queryAll, queryOne, run, getActiveCycle } = require('../../db');

const router = express.Router();

function isPMAdmin(user) {
  return user.role === 'admin' || (user.apps && user.apps.includes('pm_admin'));
}

// Build job objects with billing entries merged in as flat keys (e.g. job.feb_26 = 50000)
function getJobsWithBilling(where, params, cycleId) {
  const jobs = queryAll(`
    SELECT j.*, s.ctc_override, s.schedule_valid, s.submitted_at, s.last_updated, s.notes
    FROM jobs j
    LEFT JOIN submissions s ON j.job_no = s.job_no AND s.cycle_id = ?
    ${where}
    ORDER BY j.job_no
  `, [cycleId, ...params]);

  // Fetch all billing entries for these jobs in one query
  const jobNos = jobs.map(j => j.job_no);
  if (jobNos.length === 0) return jobs;

  const placeholders = jobNos.map(() => '?').join(',');
  const entries = queryAll(`
    SELECT job_no, month_key, amount FROM billing_entries
    WHERE cycle_id = ? AND job_no IN (${placeholders})
  `, [cycleId, ...jobNos]);

  // Build lookup: { job_no: { month_key: amount } }
  const lookup = {};
  for (const e of entries) {
    if (!lookup[e.job_no]) lookup[e.job_no] = {};
    lookup[e.job_no][e.month_key] = e.amount;
  }

  // Merge into job objects
  return jobs.map(j => ({
    ...j,
    ...(lookup[j.job_no] || {}),
  }));
}

// GET /api/pm/jobs/charts/revenue - aggregate monthly billings by division
// Must be defined BEFORE /:jobNo
router.get('/charts/revenue', (req, res) => {
  let cycle;
  if (req.query.cycle) {
    cycle = queryOne('SELECT * FROM billing_cycles WHERE id = ?', [parseInt(req.query.cycle)]);
  } else {
    cycle = getActiveCycle();
  }
  if (!cycle) return res.json({ months: [], company_totals: [], by_division: {} });
  const months = JSON.parse(cycle.months);

  const rows = queryAll(`
    SELECT j.division, be.month_key, SUM(be.amount) as total
    FROM jobs j
    JOIN billing_entries be ON j.job_no = be.job_no AND be.cycle_id = ?
    WHERE j.division IN ('CLE', 'CBUS')
    GROUP BY j.division, be.month_key
  `, [cycle.id]);

  // Build lookup: { division: { month_key: total } }
  const divLookup = {};
  for (const row of rows) {
    if (!divLookup[row.division]) divLookup[row.division] = {};
    divLookup[row.division][row.month_key] = row.total || 0;
  }

  const monthLabels = months.map(m => m.label);
  const byDivision = {};
  for (const div of Object.keys(divLookup)) {
    byDivision[div] = months.map(m => divLookup[div][m.key] || 0);
  }

  const companyTotals = months.map((m, i) => {
    return Object.values(byDivision).reduce((sum, divData) => sum + (divData[i] || 0), 0);
  });

  res.json({ months: monthLabels, company_totals: companyTotals, by_division: byDivision });
});

// Enrich jobs with aggregated cost code CTC data
function enrichWithCTC(jobs) {
  return jobs.map(job => {
    const codes = queryAll('SELECT revised_est_cost, costs_to_date, pm_revised_est FROM job_cost_codes WHERE job_no = ?', [job.job_no]);
    if (codes.length === 0) return { ...job, has_cost_codes: 0, pm_revised_total: null, ctc_calculated: null };

    const pmRevisedTotal = codes.reduce((sum, cc) => {
      return sum + (cc.pm_revised_est != null ? cc.pm_revised_est : (cc.revised_est_cost || 0));
    }, 0);
    const totalCostsToDate = codes.reduce((sum, cc) => sum + (cc.costs_to_date || 0), 0);
    const ctcCalculated = Math.max(0, pmRevisedTotal - totalCostsToDate);

    return {
      ...job,
      has_cost_codes: codes.length,
      pm_revised_total: pmRevisedTotal,
      ctc_calculated: ctcCalculated,
    };
  });
}

// GET /api/pm/jobs - PM gets their jobs, PM admin gets all
router.get('/', (req, res) => {
  const cycle = getActiveCycle();
  if (!cycle) return res.json([]);

  let jobs;
  if (isPMAdmin(req.user)) {
    jobs = getJobsWithBilling('', [], cycle.id);
  } else {
    jobs = getJobsWithBilling('WHERE j.pm = ?', [req.user.initials], cycle.id);
  }
  res.json(enrichWithCTC(jobs));
});

// GET /api/pm/jobs/:jobNo - get single job
router.get('/:jobNo', (req, res) => {
  const { jobNo } = req.params;
  const cycle = getActiveCycle();
  if (!cycle) return res.status(404).json({ error: 'No active cycle.' });

  let jobs;
  if (isPMAdmin(req.user)) {
    jobs = getJobsWithBilling('WHERE j.job_no = ?', [jobNo], cycle.id);
  } else {
    jobs = getJobsWithBilling('WHERE j.job_no = ? AND j.pm = ?', [jobNo, req.user.initials], cycle.id);
  }

  if (jobs.length === 0) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  res.json(enrichWithCTC(jobs)[0]);
});

// PUT /api/pm/jobs/:jobNo/assign - reassign PM and/or division (admin/pm_admin only)
router.put('/:jobNo/assign', (req, res) => {
  if (!isPMAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const { jobNo } = req.params;
  const { pm, division } = req.body;

  const job = queryOne('SELECT job_no FROM jobs WHERE job_no = ?', [jobNo]);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (pm !== undefined) {
    run('UPDATE jobs SET pm = ? WHERE job_no = ?', [pm, jobNo]);
    run('UPDATE submissions SET pm = ? WHERE job_no = ?', [pm, jobNo]);
  }
  if (division !== undefined) {
    run('UPDATE jobs SET division = ? WHERE job_no = ?', [division, jobNo]);
  }

  res.json({ message: `Job ${jobNo} updated.` });
});

// GET /api/pm/jobs/:jobNo/cost-codes - get cost codes for a job
router.get('/:jobNo/cost-codes', (req, res) => {
  const { jobNo } = req.params;

  // Check access
  if (!isPMAdmin(req.user)) {
    const job = queryOne('SELECT pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (!job || job.pm !== req.user.initials) {
      return res.status(403).json({ error: 'Not authorized for this job.' });
    }
  }

  const costCodes = queryAll(
    'SELECT * FROM job_cost_codes WHERE job_no = ? ORDER BY CAST(cost_code_no AS INTEGER)',
    [jobNo]
  );
  res.json(costCodes);
});

// PUT /api/pm/jobs/:jobNo/cost-codes/:costCodeNo - PM updates their estimate
router.put('/:jobNo/cost-codes/:costCodeNo', (req, res) => {
  const { jobNo, costCodeNo } = req.params;
  const { pm_revised_est } = req.body;
  const cycle = getActiveCycle();

  // Check access
  if (!isPMAdmin(req.user)) {
    const job = queryOne('SELECT pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (!job || job.pm !== req.user.initials) {
      return res.status(403).json({ error: 'Not authorized for this job.' });
    }
  }

  // Check submission lock
  if (cycle) {
    const submission = queryOne('SELECT submitted_at FROM submissions WHERE job_no = ? AND cycle_id = ?', [jobNo, cycle.id]);
    if (submission && submission.submitted_at) {
      return res.status(400).json({ error: 'Job is submitted. Contact admin to unlock.' });
    }
  }

  const val = pm_revised_est !== null && pm_revised_est !== undefined && pm_revised_est !== ''
    ? parseFloat(pm_revised_est)
    : null;

  const now = new Date().toISOString();
  run(
    'UPDATE job_cost_codes SET pm_revised_est = ?, last_updated = ? WHERE job_no = ? AND cost_code_no = ?',
    [val, now, jobNo, costCodeNo]
  );

  res.json({ pm_revised_est: val, last_updated: now });
});

module.exports = router;
