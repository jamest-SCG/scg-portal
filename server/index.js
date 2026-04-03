require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getDb, queryOne, queryAll, run } = require('./db');
const { authenticateToken, requireAdmin, requireAppAccess, requireAppAdmin } = require('./middleware/auth');

async function start() {
  // Initialize database (runs migration if needed)
  await getDb();

  // Seed default users if none exist
  const row = queryOne('SELECT COUNT(*) as count FROM users');
  if (!row || row.count === 0) {
    const defaultPin = bcrypt.hashSync('1234', 10);
    const users = [
      { initials: 'R.S.', name: 'R.S.' },
      { initials: 'C.G.', name: 'C.G.' },
      { initials: 'D.S.', name: 'D.S.' },
      { initials: 'A.E.', name: 'A.E.' },
      { initials: 'S.M.', name: 'S.M.' },
    ];
    for (const u of users) {
      run(
        'INSERT OR IGNORE INTO users (initials, name, pin, role) VALUES (?, ?, ?, ?)',
        [u.initials, u.name, defaultPin, 'user']
      );
    }
    // Create admin user
    run(
      'INSERT OR IGNORE INTO users (initials, name, pin, role) VALUES (?, ?, ?, ?)',
      ['ADMIN', 'Admin', defaultPin, 'admin']
    );

    // Grant all non-admin users access to PM app
    const nonAdmins = queryAll("SELECT id FROM users WHERE role = 'user'");
    for (const u of nonAdmins) {
      run('INSERT OR IGNORE INTO user_apps (user_id, app_id) VALUES (?, ?)', [u.id, 'pm']);
    }

    console.log('Database seeded with default users (PIN: 1234).');
  }

  const app = express();
  const PORT = process.env.PORT || 3001;

  // Trust Nginx proxy (needed for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Rate limiting for login endpoints
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: { error: 'Too many login attempts. Please try again in a minute.' },
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // === Shared Auth Routes (no app gate) ===
  app.use('/api/auth', loginLimiter, require('./routes/auth'));

  // === Portal Routes (authenticated, for dashboard + user management) ===
  app.use('/api/portal', authenticateToken, require('./routes/portal'));

  // === PM Portal Routes ===
  app.use('/api/pm/jobs', authenticateToken, requireAppAccess('pm'), require('./routes/pm/jobs'));
  app.use('/api/pm/submissions', authenticateToken, requireAppAccess('pm'), require('./routes/pm/submissions'));
  app.use('/api/pm/admin', authenticateToken, requireAppAccess('pm'), requireAppAdmin('pm'), require('./routes/pm/admin'));

  // === Storefront Routes (future) ===
  // app.use('/api/storefront', authenticateToken, requireAppAccess('storefront'), require('./routes/storefront'));

  // === Entrance Routes (future) ===
  // app.use('/api/entrance', authenticateToken, requireAppAccess('entrance'), require('./routes/entrance'));

  // Serve static files in production
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });

  app.listen(PORT, () => {
    console.log(`SCG Portal running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
