const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'scg_portal.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Check if migration is needed (old schema has CHECK constraint, no apps table)
  const appsTableExists = queryAllRaw(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='apps'"
  ).length > 0;

  if (!appsTableExists) {
    migrate();
  } else {
    // Ensure tables exist (fresh database)
    createTables();
  }

  // Add force_pin_reset column if missing (incremental migration)
  const userCols = queryAllRaw("PRAGMA table_info(users)").map(c => c.name);
  if (!userCols.includes('force_pin_reset')) {
    db.run('ALTER TABLE users ADD COLUMN force_pin_reset INTEGER DEFAULT 0');
    console.log('Added force_pin_reset column to users table.');
  }

  // Add job_cost_codes table if missing
  const costCodesExists = queryAllRaw(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='job_cost_codes'"
  ).length > 0;
  if (!costCodesExists) {
    db.run(`
      CREATE TABLE job_cost_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_no TEXT NOT NULL,
        cost_code_no TEXT NOT NULL,
        description TEXT,
        original_est REAL DEFAULT 0,
        approved_cos REAL DEFAULT 0,
        revised_est_cost REAL DEFAULT 0,
        costs_to_date REAL DEFAULT 0,
        remaining_budget REAL DEFAULT 0,
        remaining_committed_cost REAL DEFAULT 0,
        projected_over_under REAL DEFAULT 0,
        pct_variance REAL DEFAULT 0,
        pm_revised_est REAL,
        last_updated TEXT,
        FOREIGN KEY (job_no) REFERENCES jobs(job_no) ON DELETE CASCADE,
        UNIQUE(job_no, cost_code_no)
      )
    `);
    console.log('Created job_cost_codes table.');
  }

  // Add client_name and change_orders columns to jobs if missing
  const jobCols = queryAllRaw("PRAGMA table_info(jobs)").map(c => c.name);
  if (!jobCols.includes('client_name')) {
    db.run('ALTER TABLE jobs ADD COLUMN client_name TEXT');
    console.log('Added client_name column to jobs table.');
  }
  if (!jobCols.includes('change_orders')) {
    db.run('ALTER TABLE jobs ADD COLUMN change_orders REAL DEFAULT 0');
    console.log('Added change_orders column to jobs table.');
  }

  // Migrate to dynamic billing cycles if submissions still has hardcoded month columns
  const subCols = queryAllRaw("PRAGMA table_info(submissions)").map(c => c.name);
  if (subCols.includes('feb_26')) {
    migrateToBillingCycles();
  }

  save();
  return db;
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initials TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      force_pin_reset INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      path TEXT NOT NULL,
      icon TEXT,
      active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_apps (
      user_id INTEGER NOT NULL,
      app_id TEXT NOT NULL,
      PRIMARY KEY (user_id, app_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_no TEXT PRIMARY KEY,
      job_name TEXT NOT NULL,
      division TEXT,
      pm TEXT,
      contract REAL DEFAULT 0,
      est_cost REAL DEFAULT 0,
      cost_to_date REAL DEFAULT 0,
      billed REAL DEFAULT 0,
      remaining REAL DEFAULT 0,
      ret_pct REAL DEFAULT 0,
      pct_complete REAL DEFAULT 0,
      import_date TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      months TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      archived_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS billing_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      job_no TEXT NOT NULL,
      month_key TEXT NOT NULL,
      amount REAL DEFAULT 0,
      FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id),
      FOREIGN KEY (job_no) REFERENCES jobs(job_no) ON DELETE CASCADE,
      UNIQUE(cycle_id, job_no, month_key)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_no TEXT NOT NULL,
      cycle_id INTEGER NOT NULL,
      pm TEXT,
      ctc_override REAL,
      schedule_valid INTEGER DEFAULT 0,
      submitted_at TEXT,
      last_updated TEXT,
      notes TEXT,
      FOREIGN KEY (job_no) REFERENCES jobs(job_no),
      FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id),
      UNIQUE(job_no, cycle_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS job_cost_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_no TEXT NOT NULL,
      cost_code_no TEXT NOT NULL,
      description TEXT,
      original_est REAL DEFAULT 0,
      approved_cos REAL DEFAULT 0,
      revised_est_cost REAL DEFAULT 0,
      costs_to_date REAL DEFAULT 0,
      remaining_budget REAL DEFAULT 0,
      remaining_committed_cost REAL DEFAULT 0,
      projected_over_under REAL DEFAULT 0,
      pct_variance REAL DEFAULT 0,
      pm_revised_est REAL,
      last_updated TEXT,
      FOREIGN KEY (job_no) REFERENCES jobs(job_no) ON DELETE CASCADE,
      UNIQUE(job_no, cost_code_no)
    )
  `);
}

function migrate() {
  console.log('Running database migration to portal schema...');

  // Check if old users table exists with CHECK constraint
  const usersExists = queryAllRaw(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
  ).length > 0;

  if (usersExists) {
    // Read existing users
    const existingUsers = queryAllRaw('SELECT * FROM users');

    // Drop and recreate users table without CHECK constraint
    db.run('DROP TABLE IF EXISTS users');
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        initials TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        pin TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
      )
    `);

    // Re-insert users with mapped roles (pm -> user, admin stays admin)
    for (const u of existingUsers) {
      const newRole = u.role === 'pm' ? 'user' : u.role;
      db.run(
        'INSERT INTO users (id, initials, name, pin, role) VALUES (?, ?, ?, ?, ?)',
        [u.id, u.initials, u.name, u.pin, newRole]
      );
    }

    console.log(`Migrated ${existingUsers.length} users (pm -> user role mapping).`);
  } else {
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        initials TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        pin TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
      )
    `);
  }

  // Create apps table
  db.run(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      path TEXT NOT NULL,
      icon TEXT,
      active INTEGER DEFAULT 1
    )
  `);

  // Seed default apps
  const defaultApps = [
    { id: 'pm', name: 'PM Portal', description: 'Billing projections & estimated costs to complete', path: '/pm', icon: 'chart', active: 1 },
    { id: 'storefront', name: 'Storefront / Curtainwall', description: 'Auto-generate orders, cut lists & glass sizes', path: '/storefront', icon: 'building', active: 0 },
    { id: 'entrance', name: 'Entrance Estimator', description: 'Aluminum entrance estimating & ordering', path: '/entrance', icon: 'door', active: 0 },
  ];

  for (const app of defaultApps) {
    db.run(
      'INSERT OR IGNORE INTO apps (id, name, description, path, icon, active) VALUES (?, ?, ?, ?, ?, ?)',
      [app.id, app.name, app.description, app.path, app.icon, app.active]
    );
  }

  // Create user_apps junction table
  db.run(`
    CREATE TABLE IF NOT EXISTS user_apps (
      user_id INTEGER NOT NULL,
      app_id TEXT NOT NULL,
      PRIMARY KEY (user_id, app_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);

  // Grant all former PM users access to the PM app
  if (usersExists) {
    const nonAdminUsers = queryAllRaw("SELECT id FROM users WHERE role = 'user'");
    for (const u of nonAdminUsers) {
      db.run('INSERT OR IGNORE INTO user_apps (user_id, app_id) VALUES (?, ?)', [u.id, 'pm']);
    }
    console.log(`Granted PM app access to ${nonAdminUsers.length} users.`);
  }

  // Ensure jobs and submissions tables exist
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_no TEXT PRIMARY KEY,
      job_name TEXT NOT NULL,
      division TEXT,
      pm TEXT,
      contract REAL DEFAULT 0,
      est_cost REAL DEFAULT 0,
      cost_to_date REAL DEFAULT 0,
      billed REAL DEFAULT 0,
      remaining REAL DEFAULT 0,
      ret_pct REAL DEFAULT 0,
      pct_complete REAL DEFAULT 0,
      import_date TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      months TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      archived_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS billing_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      job_no TEXT NOT NULL,
      month_key TEXT NOT NULL,
      amount REAL DEFAULT 0,
      FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id),
      FOREIGN KEY (job_no) REFERENCES jobs(job_no) ON DELETE CASCADE,
      UNIQUE(cycle_id, job_no, month_key)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_no TEXT NOT NULL,
      cycle_id INTEGER NOT NULL,
      pm TEXT,
      ctc_override REAL,
      schedule_valid INTEGER DEFAULT 0,
      submitted_at TEXT,
      last_updated TEXT,
      notes TEXT,
      FOREIGN KEY (job_no) REFERENCES jobs(job_no),
      FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id),
      UNIQUE(job_no, cycle_id)
    )
  `);

  console.log('Migration complete.');
}

function migrateToBillingCycles() {
  console.log('Migrating to dynamic billing cycles...');

  const MONTH_KEYS = ['feb_26','mar_26','apr_26','may_26','jun_26','jul_26','aug_26','sep_26','oct_26','nov_26','dec_26'];
  const MONTH_LABELS = ['Feb 26','Mar 26','Apr 26','May 26','Jun 26','Jul 26','Aug 26','Sep 26','Oct 26','Nov 26','Dec 26'];
  const monthsJson = JSON.stringify(MONTH_KEYS.map((key, i) => ({ key, label: MONTH_LABELS[i] })));

  // 1. Create billing_cycles table (may already exist from createTables)
  db.run('DROP TABLE IF EXISTS billing_cycles');
  db.run('DROP TABLE IF EXISTS billing_entries');
  db.run(`
    CREATE TABLE billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      months TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      archived_at TEXT
    )
  `);

  // 2. Create billing_entries table
  db.run(`
    CREATE TABLE billing_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      job_no TEXT NOT NULL,
      month_key TEXT NOT NULL,
      amount REAL DEFAULT 0,
      FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id),
      FOREIGN KEY (job_no) REFERENCES jobs(job_no) ON DELETE CASCADE,
      UNIQUE(cycle_id, job_no, month_key)
    )
  `);

  // 3. Seed the current cycle
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO billing_cycles (name, months, is_active, created_at) VALUES (?, ?, 1, ?)',
    ['FY2026 Feb-Dec', monthsJson, now]
  );
  const cycle = queryAllRaw('SELECT id FROM billing_cycles WHERE is_active = 1');
  const cycleId = cycle[0].id;

  // 4. Migrate existing submission month data to billing_entries
  const oldSubmissions = queryAllRaw('SELECT * FROM submissions');
  for (const sub of oldSubmissions) {
    for (const key of MONTH_KEYS) {
      const amount = sub[key] || 0;
      db.run(
        'INSERT INTO billing_entries (cycle_id, job_no, month_key, amount) VALUES (?, ?, ?, ?)',
        [cycleId, sub.job_no, key, amount]
      );
    }
  }
  console.log(`Migrated ${oldSubmissions.length} submissions x ${MONTH_KEYS.length} months to billing_entries.`);

  // 5. Rebuild submissions table without month columns
  db.run(`
    CREATE TABLE submissions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_no TEXT NOT NULL,
      cycle_id INTEGER NOT NULL,
      pm TEXT,
      ctc_override REAL,
      schedule_valid INTEGER DEFAULT 0,
      submitted_at TEXT,
      last_updated TEXT,
      notes TEXT,
      FOREIGN KEY (job_no) REFERENCES jobs(job_no),
      FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id),
      UNIQUE(job_no, cycle_id)
    )
  `);

  for (const sub of oldSubmissions) {
    db.run(
      'INSERT INTO submissions_new (job_no, cycle_id, pm, ctc_override, schedule_valid, submitted_at, last_updated, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [sub.job_no, cycleId, sub.pm, sub.ctc_override, sub.schedule_valid, sub.submitted_at, sub.last_updated, sub.notes]
    );
  }

  db.run('DROP TABLE submissions');
  db.run('ALTER TABLE submissions_new RENAME TO submissions');

  console.log('Billing cycles migration complete.');
}

// Raw query helper used during migration (before db is fully set up)
function queryAllRaw(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Helper: run a query that returns rows (SELECT)
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a query that returns a single row
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: run a statement (INSERT, UPDATE, DELETE)
function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// Helper: run multiple statements with a single save at the end (for bulk imports)
function runBatch(statements) {
  for (const [sql, params] of statements) {
    db.run(sql, params || []);
  }
  save();
}

function getActiveCycle() {
  return queryOne('SELECT * FROM billing_cycles WHERE is_active = 1');
}

function getActiveCycleMonths() {
  const cycle = getActiveCycle();
  if (!cycle) return [];
  return JSON.parse(cycle.months);
}

module.exports = { getDb, save, queryAll, queryOne, run, runBatch, getActiveCycle, getActiveCycleMonths };
