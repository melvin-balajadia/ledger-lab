const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { finished } = require('stream/promises');

const BACKUP_DIR = path.join(__dirname, '../../backups');
// Same path scripts/backup-db.ps1 already assumes -- this laptop has
// exactly one MySQL install.
const MYSQLDUMP_PATH = 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe';
const RETENTION_COUNT = 30;

let backupInProgress = false;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Deletes everything past the newest RETENTION_COUNT dumps, same policy as
// scripts/backup-db.ps1, so manual + scheduled backups share one cap
// instead of the disk filling from repeated button-clicks.
function applyRetention(database) {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(`${database}_`) && f.endsWith('.sql'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const f of files.slice(RETENTION_COUNT)) {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
  }
}

// Mirrors scripts/backup-db.ps1's mysqldump flags exactly, so a manual
// in-app backup and the scheduled nightly one produce interchangeable
// files. Takes no input from the caller -- database name, output path, and
// the mysqldump argument list are all fixed here, never client-supplied.
async function runBackup() {
  if (backupInProgress) {
    throw Object.assign(new Error('A backup is already in progress.'), { status: 409 });
  }
  if (!fs.existsSync(MYSQLDUMP_PATH)) {
    throw Object.assign(
      new Error('mysqldump.exe not found -- is MySQL installed at the expected path?'),
      { status: 500 },
    );
  }

  backupInProgress = true;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const database = process.env.DB_NAME;
    const filename = `${database}_${timestamp()}.sql`;
    const outPath = path.join(BACKUP_DIR, filename);

    const args = [
      `--user=${process.env.DB_USER}`,
      `--password=${process.env.DB_PASSWORD}`,
      '--single-transaction',
      '--routines',
      '--triggers',
      '--databases',
      database,
    ];

    const out = fs.createWriteStream(outPath);
    const child = spawn(MYSQLDUMP_PATH, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.pipe(out);

    const [exitCode] = await Promise.all([
      new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      }),
      finished(out),
    ]);
    if (exitCode !== 0) {
      fs.unlink(outPath, () => {});
      throw new Error(`mysqldump exited with code ${exitCode}: ${stderr.slice(0, 500)}`);
    }

    const stat = fs.statSync(outPath);
    if (stat.size < 1024) {
      fs.unlinkSync(outPath);
      throw new Error('Backup looks empty -- discarded.');
    }

    applyRetention(database);
    return { filename, sizeBytes: stat.size, createdAt: new Date().toISOString() };
  } finally {
    backupInProgress = false;
  }
}

module.exports = { runBackup };
