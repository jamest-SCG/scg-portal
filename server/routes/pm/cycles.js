const express = require('express');
const { getActiveCycle } = require('../../db');

const router = express.Router();

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
