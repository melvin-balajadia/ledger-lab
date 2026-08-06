const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

// Images only -- these are photo references (MSR labels, delivery docs),
// never editable content, so disk + a metadata row is enough (see
// db/migrations/011_po_attachments.sql).
const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const UPLOAD_ROOT = path.join(__dirname, '../uploads/purchase-orders');

// poId reaches path.join() below -- it must be confirmed a plain positive
// integer first, or a crafted value like "../../../somewhere" would resolve
// outside UPLOAD_ROOT. Express param values are never implicitly numeric.
function poUploadDir(poId) {
  const id = Number(poId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid purchase order id');
  }
  return path.join(UPLOAD_ROOT, String(id));
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    let dir;
    try {
      dir = poUploadDir(req.params.poId);
    } catch (err) {
      return cb(err);
    }
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, `${crypto.randomUUID()}${ALLOWED_TYPES[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_TYPES[file.mimetype]) {
      return cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
    }
    cb(null, true);
  },
});

module.exports = { upload, poUploadDir, MAX_SIZE_BYTES };
