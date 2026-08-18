const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, full_name FROM users WHERE username = ? AND is_active = 1',
      [username]
    );
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'invalid username or password' });

    req.session.userId = user.id;
    req.session.username = user.username;
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    res.json({ username: user.username, full_name: user.full_name });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    // Must match the name index.js gives the session cookie, or logout leaves a
    // stale cookie in the browser (harmless -- destroy() already killed the
    // server-side session -- but it never gets cleaned up).
    res.clearCookie(process.env.SESSION_COOKIE_NAME || 'connect.sid');
    res.json({});
  });
});

router.get('/me', async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'not authenticated' });
  try {
    const [rows] = await pool.query('SELECT username, full_name FROM users WHERE id = ?', [req.session.userId]);
    if (rows.length === 0) return res.status(401).json({ error: 'not authenticated' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
