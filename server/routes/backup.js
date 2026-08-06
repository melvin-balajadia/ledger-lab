const express = require('express');
const { runBackup } = require('../lib/backup');

const router = express.Router();

// No params in or out of this endpoint besides the result -- the DB
// password never appears in the response, only used server-side to spawn
// mysqldump. Auth is the same requireAuth session gate every other
// mutating route in this app already sits behind (see server/index.js).
router.post('/', async (req, res) => {
  try {
    const result = await runBackup();
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

module.exports = router;
