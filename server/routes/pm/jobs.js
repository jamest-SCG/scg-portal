const express = require('express');
const { queryAll, queryOne, run } = require('../../db');

const router = express.Router();

function isPMAdmin(user) {
  return user.role === 'admin' || (user.apps && user.apps.includes('pm_admin'));
}

const JOB_SELECT = `
  SELECT j.*, s.feb_26, s.mar_26, s.apr_26, s.may_26, s.jun_26, s.jul_26,
         s.aug_26, s.sep_26, s.oct_26, s.nov_26, s.dec_26,
         s.ctc_override, s.schedule_valid, s.submitted_at, s.last_updated, s.notes
  FROM jobs j
  LEFT JOIN submissions s ON j.job_no = s.job_no
`;

// GET /api/pm/jobs/charts/revenue - aggregate monthly billings by division
// Must be defined BEFORE /:jobNo
router.get('/charts/revenue', (req, res) => {
  const rows = queryAll(`
    SELECT j.division,
      SUM(s.mar_26) as mar, SUM(s.apr_26) as apr, SUM(s.may_26) as may,
      SUM(s.jun_26) as jun, SUM(s.jul_26) as jul, SUM(s.aug_26) as aug,
      SUM(s.sep_26) as sep, SUM(s.oct_26) as oct, SUM(s.nov_26) as nov,
      SUM(s.dec_26) as dec
    FROM jobs j
    LEFT JOIN submissions s ON j.job_no = s.job_no
    WHERE j.division IN ('CLE', 'CBUS')
    GROUP BY j.division
  `);

  const months = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const keys = ['mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const byDivision = {};
  for (const row of rows) {
    byDivision[row.division] = keys.map(k => row[k] || 0);
  }

  const companyTotals = keys.map((k, i) => {
    return Object.values(byDivision).reduce((sum, divData) => sum + (divData[i] || 0), 0);
  });

  res.json({ months, company_totals: companyTotals, by_division: byDivision });
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
  let jobs;
  if (isPMAdmin(req.user)) {
    jobs = queryAll(`${JOB_SELECT} ORDER BY j.job_no`);
  } else {
    jobs = queryAll(`${JOB_SELECT} WHERE j.pm = ? ORDER BY j.job_no`, [req.user.initials]);
  }
  res.json(enrichWithCTC(jobs));
});

// GET /api/pm/jobs/:jobNo - get single job
router.get('/:jobNo', (req, res) => {
  const { jobNo } = req.params;

  let job;
  if (isPMAdmin(req.user)) {
    job = queryOne(`${JOB_SELECT} WHERE j.job_no = ?`, [jobNo]);
  } else {
    job = queryOne(`${JOB_SELECT} WHERE j.job_no = ? AND j.pm = ?`, [jobNo, req.user.initials]);
  }

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  res.json(enrichWithCTC([job])[0]);
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

  // Check access
  if (!isPMAdmin(req.user)) {
    const job = queryOne('SELECT pm FROM jobs WHERE job_no = ?', [jobNo]);
    if (!job || job.pm !== req.user.initials) {
      return res.status(403).json({ error: 'Not authorized for this job.' });
    }
  }

  // Check submission lock
  const submission = queryOne('SELECT submitted_at FROM submissions WHERE job_no = ?', [jobNo]);
  if (submission && submission.submitted_at) {
    return res.status(400).json({ error: 'Job is submitted. Contact admin to unlock.' });
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
