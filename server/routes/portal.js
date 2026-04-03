const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { queryAll, queryOne, run } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const BACKUP_DIR = '/var/backups/scg-portal';
const DB_PATH = path.join(__dirname, '..', 'data', 'scg_portal.db');

const router = express.Router();

// GET /api/portal/apps - get apps the authenticated user can access
router.get('/apps', (req, res) => {
  let apps;
  if (req.user.role === 'admin') {
    apps = queryAll('SELECT * FROM apps WHERE active = 1 ORDER BY name');
  } else {
    apps = queryAll(`
      SELECT a.* FROM apps a
      JOIN user_apps ua ON a.id = ua.app_id
      WHERE ua.user_id = ? AND a.active = 1
      ORDER BY a.name
    `, [req.user.id]);
  }
  res.json(apps);
});

// GET /api/portal/all-apps - admin gets all apps (including inactive)
router.get('/all-apps', requireAdmin, (req, res) => {
  const apps = queryAll('SELECT * FROM apps ORDER BY name');
  res.json(apps);
});

// GET /api/portal/users - admin gets all users with their app assignments
router.get('/users', requireAdmin, (req, res) => {
  const users = queryAll('SELECT id, initials, name, role FROM users ORDER BY name');
  const userApps = queryAll('SELECT user_id, app_id FROM user_apps');

  const result = users.map(u => ({
    ...u,
    apps: userApps.filter(ua => ua.user_id === u.id).map(ua => ua.app_id),
  }));

  res.json(result);
});

// PUT /api/portal/user-apps - admin updates a user's app permissions
router.put('/user-apps', requireAdmin, (req, res) => {
  const { userId, apps } = req.body;

  if (!userId || !Array.isArray(apps)) {
    return res.status(400).json({ error: 'userId and apps array are required.' });
  }

  const user = queryOne('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Clear existing assignments and re-insert
  run('DELETE FROM user_apps WHERE user_id = ?', [userId]);
  for (const appId of apps) {
    run('INSERT OR IGNORE INTO user_apps (user_id, app_id) VALUES (?, ?)', [userId, appId]);
  }

  res.json({ message: 'App permissions updated.' });
});

// POST /api/portal/users - admin creates a new user
router.post('/users', requireAdmin, (req, res) => {
  const { initials, name, pin, apps } = req.body;

  if (!initials || !name || !pin) {
    return res.status(400).json({ error: 'Initials, name, and PIN are required.' });
  }

  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }

  const existing = queryOne('SELECT id FROM users WHERE initials = ?', [initials]);
  if (existing) {
    return res.status(400).json({ error: 'A user with these initials already exists.' });
  }

  const hashed = bcrypt.hashSync(pin, 10);
  run('INSERT INTO users (initials, name, pin, role) VALUES (?, ?, ?, ?)', [initials, name, hashed, 'user']);

  const newUser = queryOne('SELECT id FROM users WHERE initials = ?', [initials]);
  if (newUser && Array.isArray(apps)) {
    for (const appId of apps) {
      run('INSERT OR IGNORE INTO user_apps (user_id, app_id) VALUES (?, ?)', [newUser.id, appId]);
    }
  }

  res.json({ message: 'User created successfully.', userId: newUser ? newUser.id : null });
});

// DELETE /api/portal/users/:id - admin deletes a user
router.delete('/users/:id', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);

  const user = queryOne('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (user.role === 'admin') {
    return res.status(400).json({ error: 'Cannot delete the admin user.' });
  }

  run('DELETE FROM user_apps WHERE user_id = ?', [userId]);
  run('DELETE FROM users WHERE id = ?', [userId]);
  res.json({ message: 'User deleted.' });
});

// === Backup Management (admin only) ===

// GET /api/portal/backups - list available backups
router.get('/backups', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('scg_portal_') && f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          filename: f,
          size: stat.size,
          created: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.created.localeCompare(a.created));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list backups: ' + err.message });
  }
});

// POST /api/portal/backups - create a backup now
router.post('/backups', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const date = new Date().toISOString().replace(/[T:]/g, '_').split('.')[0];
    const filename = `scg_portal_${date}.db`;
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, filename));
    const stat = fs.statSync(path.join(BACKUP_DIR, filename));
    res.json({ message: 'Backup created.', filename, size: stat.size });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create backup: ' + err.message });
  }
});

// GET /api/portal/backups/:filename - download a backup file
router.get('/backups/:filename', requireAdmin, (req, res) => {
  const { filename } = req.params;
  // Sanitize filename to prevent path traversal
  if (!/^scg_portal_[\w]+\.db$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Backup not found.' });
  }
  res.download(filepath, filename);
});

// POST /api/portal/backups/:filename/restore - restore from a backup
router.post('/backups/:filename/restore', requireAdmin, (req, res) => {
  const { filename } = req.params;
  if (!/^scg_portal_[\w]+\.db$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Backup not found.' });
  }

  try {
    // Create a safety backup of current state before restoring
    const safetyName = `scg_portal_pre_restore_${Date.now()}.db`;
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, safetyName));

    // Copy backup over current database
    fs.copyFileSync(filepath, DB_PATH);

    res.json({
      message: `Database restored from ${filename}. A safety backup was saved as ${safetyName}. Server is restarting...`,
      safety_backup: safetyName,
    });

    // Auto-restart the process so sql.js reloads the restored database
    // Delay slightly so the response is sent first
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore: ' + err.message });
  }
});

// DELETE /api/portal/backups/:filename - delete a backup
router.delete('/backups/:filename', requireAdmin, (req, res) => {
  const { filename } = req.params;
  if (!/^scg_portal_[\w]+\.db$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Backup not found.' });
  }
  fs.unlinkSync(filepath);
  res.json({ message: 'Backup deleted.' });
});

module.exports = router;
