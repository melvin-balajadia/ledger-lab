const express = require('express');
const { collectReviewItems } = require('../lib/reviewItems');

const router = express.Router();

router.get('/:id/review', async (req, res, next) => {
  try {
    res.json(await collectReviewItems(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
