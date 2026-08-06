const mysql = require('mysql2/promise');

// ponytail: decimalNumbers stays unset (defaults to false) so DECIMAL columns
// (peso amounts up to 1.3B) come back as strings, not lossy JS floats.
// dateStrings: without it, DATE/TIMESTAMP columns come back as JS Date
// objects, which JSON.stringify then shifts to a UTC timestamp -- a
// 2026-06-01 DATE silently becomes "2026-05-31T16:00:00.000Z" downstream.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

module.exports = pool;
