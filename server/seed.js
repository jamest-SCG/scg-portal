require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb, queryOne, queryAll, run } = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  await getDb();

  const users = [
    { initials: 'R.S.', name: 'R.S.' },
    { initials: 'C.G.', name: 'C.G.' },
    { initials: 'D.S.', name: 'D.S.' },
    { initials: 'A.E.', name: 'A.E.' },
    { initials: 'S.M.', name: 'S.M.' },
  ];

  const defaultPin = bcrypt.hashSync('1234', 10);

  for (const u of users) {
    run(
      'INSERT OR IGNORE INTO users (initials, name, pin, role) VALUES (?, ?, ?, ?)',
      [u.initials, u.name, defaultPin, 'user']
    );
  }

  // Admin user
  run(
    'INSERT OR IGNORE INTO users (initials, name, pin, role) VALUES (?, ?, ?, ?)',
    ['ADMIN', 'Admin', defaultPin, 'admin']
  );

  // Grant PM app access to non-admin users
  const nonAdmins = queryAll("SELECT id FROM users WHERE role = 'user'");
  for (const u of nonAdmins) {
    run('INSERT OR IGNORE INTO user_apps (user_id, app_id) VALUES (?, ?)', [u.id, 'pm']);
  }

  console.log('Database seeded with default users.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
