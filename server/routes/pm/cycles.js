const express = require('express');
const { queryAll, getActiveCycle } = require('../../db');

const router = express.Router();

// GET /api/pm/cycles - list all cycles (active first, then archived by date)
router.get('/', (req, res) => {
  const cycles = queryAll('SELECT id, name, is_active, created_at, archived_at FROM billing_cycles ORDER BY is_active DESC, created_at DESC');
  res.json(cycles);
});

// GET /api/pm/cycles/active - get the active billing cycle
router.get('/active', (req, res) => {
  const cycle = getActiveCycle();
  if (!cycle) {
    return res.status(404).json({ error: 'No active billing cycle found.' });
  }
  res.json({
    id: cycle.id,
    name: cycle.name,
    months: JSON.parse(cycle.months),
    created_at: cycle.created_at,
  });
});

module.exports = router;
