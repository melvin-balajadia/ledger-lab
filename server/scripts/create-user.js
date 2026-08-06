// Usage: node scripts/create-user.js <username> <password> [full_name]
// Inserts a user, or updates the password_hash if the username already exists.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
  const [username, password, fullName] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Usage: node scripts/create-user.js <username> <password> [full_name]');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name)`,
    [username, hash, fullName || null]
  );

  console.log(`User "${username}" saved.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
