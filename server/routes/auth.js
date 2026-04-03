const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryAll, queryOne, run } = require('../db');
const { JWT_SECRET, authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/auth/users - list non-admin users for login dropdown
router.get('/users', (req, res) => {
  const users = queryAll("SELECT id, initials, name FROM users WHERE role != 'admin'");
  res.json(users);
});

// POST /api/auth/login - user login (initials + PIN)
router.post('/login', (req, res) => {
  const { initials, pin } = req.body;

  if (!initials || !pin) {
    return res.status(400).json({ error: 'Initials and PIN are required.' });
  }

  const user = queryOne('SELECT * FROM users WHERE initials = ?', [initials]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const validPin = bcrypt.compareSync(pin, user.pin);
  if (!validPin) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Fetch user's app permissions
  const userApps = queryAll('SELECT app_id FROM user_apps WHERE user_id = ?', [user.id]);
  const apps = userApps.map(a => a.app_id);

  const token = jwt.sign(
    { id: user.id, initials: user.initials, name: user.name, role: user.role, apps },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: { id: user.id, initials: user.initials, name: user.name, role: user.role, apps },
    forcePinReset: !!user.force_pin_reset,
  });
});

// POST /api/auth/admin-login - admin login (PIN only)
router.post('/admin-login', (req, res) => {
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'PIN is required.' });
  }

  const user = queryOne("SELECT * FROM users WHERE role = 'admin'");
  if (!user) {
    return res.status(401).json({ error: 'Admin user not found.' });
  }

  const validPin = bcrypt.compareSync(pin, user.pin);
  if (!validPin) {
    return res.status(401).json({ error: 'Invalid PIN.' });
  }

  // Admin gets access to all apps
  const allApps = queryAll('SELECT id FROM apps');
  const apps = allApps.map(a => a.id);

  const token = jwt.sign(
    { id: user.id, initials: user.initials, name: user.name, role: user.role, apps },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: { id: user.id, initials: user.initials, name: user.name, role: user.role, apps },
    forcePinReset: !!user.force_pin_reset,
  });
});

// PUT /api/auth/change-pin - admin changes a user's PIN (with optional force reset flag)
router.put('/change-pin', authenticateToken, requireAdmin, (req, res) => {
  const { userId, newPin, forceReset } = req.body;

  if (!userId || !newPin) {
    return res.status(400).json({ error: 'User ID and new PIN are required.' });
  }

  if (!/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }

  const hashed = bcrypt.hashSync(newPin, 10);
  const resetFlag = forceReset ? 1 : 0;
  run('UPDATE users SET pin = ?, force_pin_reset = ? WHERE id = ?', [hashed, resetFlag, userId]);
  res.json({ message: forceReset ? 'PIN set. User will be prompted to change it on next login.' : 'PIN updated successfully.' });
});

// PUT /api/auth/self-change-pin - user changes their own PIN
router.put('/self-change-pin', authenticateToken, (req, res) => {
  const { currentPin, newPin } = req.body;

  if (!currentPin || !newPin) {
    return res.status(400).json({ error: 'Current PIN and new PIN are required.' });
  }

  if (!/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }

  const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const validPin = bcrypt.compareSync(currentPin, user.pin);
  if (!validPin) {
    return res.status(401).json({ error: 'Current PIN is incorrect.' });
  }

  if (currentPin === newPin) {
    return res.status(400).json({ error: 'New PIN must be different from current PIN.' });
  }

  const hashed = bcrypt.hashSync(newPin, 10);
  run('UPDATE users SET pin = ?, force_pin_reset = 0 WHERE id = ?', [hashed, req.user.id]);
  res.json({ message: 'PIN changed successfully.' });
});

// PUT /api/auth/forced-change-pin - user sets a new PIN during forced reset (no current PIN needed)
router.put('/forced-change-pin', authenticateToken, (req, res) => {
  const { newPin } = req.body;

  if (!newPin) {
    return res.status(400).json({ error: 'New PIN is required.' });
  }

  if (!/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }

  const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !user.force_pin_reset) {
    return res.status(400).json({ error: 'No forced PIN reset pending.' });
  }

  const hashed = bcrypt.hashSync(newPin, 10);
  run('UPDATE users SET pin = ?, force_pin_reset = 0 WHERE id = ?', [hashed, req.user.id]);
  res.json({ message: 'PIN set successfully.' });
});

// GET /api/auth/all-users - admin gets all users
router.get('/all-users', authenticateToken, requireAdmin, (req, res) => {
  const users = queryAll('SELECT id, initials, name, role FROM users');
  res.json(users);
});

module.exports = router;
