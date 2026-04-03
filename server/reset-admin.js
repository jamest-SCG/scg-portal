require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb, run } = require('./db');

async function resetAdmin() {
  await getDb();

  // Generate a random 4-digit temporary PIN
  const tempPin = String(crypto.randomInt(1000, 9999));
  const hashed = bcrypt.hashSync(tempPin, 10);

  run('UPDATE users SET pin = ?, force_pin_reset = 1 WHERE role = ?', [hashed, 'admin']);

  console.log('');
  console.log('  Admin PIN has been reset.');
  console.log(`  Temporary PIN: ${tempPin}`);
  console.log('  You will be required to set a new PIN on next login.');
  console.log('');

  process.exit(0);
}

resetAdmin().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
