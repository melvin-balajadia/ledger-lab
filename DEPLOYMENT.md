# Running this on the accountant's PC

One user, one machine, no technical knowledge required. She should double-click
one icon and get the dashboard — nothing else.

**Development** runs two processes (Vite on 5173, Express on 4000) with CORS
between them. **Production does not.** Build the React app to static files and
let Express serve them, so there is one process, one port, one URL, and no CORS.

The app currently listens on port **4000** (`server/.env` → `PORT=4000`) — use
that, not 3001, everywhere below.

---

## 1. First-time setup — MySQL, the database import, and dependencies

Only needed once, on a machine that has never run this app before.

### 1a. Install prerequisites

- Node.js LTS (18+)
- MySQL 8.0 Server (Community edition is fine)

### 1b. Create the database and import the data

The single file to bring to a new machine is **`db/rcsni_cost_clean_2026-08-06.sql`**
— a full dump of the schema *and* the real, corrected project data (every
migration through `015_cash_advances_control_no.sql` already applied, no
test/sample rows left active). Nothing else under `db/` needs to run —
not `schema.sql`, not `load_seed.sql`, not anything in `db/migrations/`.
Those are dev-bootstrap and history, already baked into this one file.

```powershell
mysql -u root -p -e "CREATE DATABASE rcsni_cost CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
Get-Content db\rcsni_cost_clean_2026-08-06.sql | mysql -u root -p rcsni_cost
```

Git Bash / Mac / Linux:

```bash
mysql -u root -p -e "CREATE DATABASE rcsni_cost CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -u root -p rcsni_cost < db/rcsni_cost_clean_2026-08-06.sql
```

**This file goes stale the moment real data changes again** (a correction,
a new migration, a week of her using the app). Before any future
deployment, regenerate it from whichever database is currently live and
correct — either:

```bash
mysqldump -u root -p --routines --triggers --single-transaction rcsni_cost > db/rcsni_cost_clean_<today>.sql
```

or just click **"Backup now"** in the app itself (top of every screen) —
same `mysqldump`, drops the file in `backups/` instead. Either way, that
fresh file is what you import on the new machine, not this dated one.

### 1c. Configure `server/.env`

Copy `server/.env.example` to `server/.env` and fill in:

- `DB_PASSWORD` — the MySQL root password on this machine
- `SESSION_SECRET` — generate a random string, don't reuse the example value

Leave `DB_NAME=rcsni_cost`, `PORT=4000`, and `CLIENT_ORIGIN` as-is — the rest
of this doc assumes those defaults.

### 1d. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

Then continue to step 2 below.

---

## 2. Serve the frontend from Express

In `client/`:

```bash
npm run build          # outputs client/dist/
```

`server/index.js` is CommonJS (`require`, not `import`) — already wired in,
placed after every `/api` mount and before the error handler:

```js
const path = require('path');
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// SPA fallback -- must come AFTER all /api routes, or it swallows them
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});
```

Order matters. If the fallback is registered before the API routes, every
`/api/...` request returns `index.html` and nothing works.

Now `http://localhost:4000` serves the whole app.

**Whenever you ship a change:** re-run `npm run build` in `client/`, then
restart the server. She doesn't rebuild anything herself.

---

## 3. Make MySQL start by itself

She must never have to start a database. Set the service to Automatic:

```powershell
Get-Service MySQL80 | Set-Service -StartupType Automatic
```

Confirm the service name first — `Get-Service *mysql*`. On this install it's
`MySQL80`. Requires an elevated PowerShell.

---

## 4. Start it with one double-click

`scripts/start-plaridel.bat`, with a Desktop shortcut pointing at it. Rename the
shortcut to something like "Plaridel Costing" and set an icon.

**Working directory matters.** `server/index.js` calls `require('dotenv').config()`
with no path override, so it loads `.env` relative to the process's *current
directory* — not the script's location. `server/.env` only gets found if the
process is actually running with `server/` as its cwd. The batch script `cd`s
there before starting node; don't "simplify" that away, or the app boots with
no DB password, no port, no session secret, and fails silently.

She double-clicks, the browser opens a couple seconds later (delayed on
purpose — opening it immediately can race Express's startup and show "can't
reach this page" on the first load). Closing the black console window stops
the app — worth telling her once, or use the service option below.

---

## 5. Better: run it as a Windows service

Once the app is stable, this removes the console window and starts the app at
boot. She just uses a browser bookmark and never sees a terminal.

Install [NSSM](https://nssm.cc/download), then in an elevated prompt:

```
nssm install PlaridelDashboard "C:\Program Files\nodejs\node.exe"
nssm set PlaridelDashboard AppDirectory "C:\Plaridel\plaridel-dashboard\server"
nssm set PlaridelDashboard AppParameters "index.js"
nssm set PlaridelDashboard DependOnService MySQL80
nssm set PlaridelDashboard Start SERVICE_AUTO_START
nssm start PlaridelDashboard
```

`AppDirectory` must be the **`server` folder**, not the repo root — same
dotenv-resolves-against-cwd reason as above. Get this wrong and the service
starts but every request 500s on a missing DB connection.

`DependOnService` matters — without it Node can start before MySQL is accepting
connections and the app fails on boot.

Then give her a bookmark to `http://localhost:4000` and delete the shortcut.

---

## 6. Backups — do this before she enters any real data

She will be entering figures that feed billing. There is no second copy.

There are two ways to trigger the same backup — automatic and manual:

- **Automatic (the real safety net):** `scripts/backup-db.ps1` on a nightly
  Task Scheduler job, below.
- **Manual (before she edits something she's nervous about):** the
  **"Backup now"** button in the app header. Same `mysqldump` under the
  hood, same `backups/` folder, same 30-file retention — just triggerable
  on demand with no PowerShell involved.

`scripts/backup-db.ps1` writes a timestamped dump and keeps the last 30. It
reads the DB password out of `server/.env` at run time rather than storing a
second copy of it — if the password ever changes, update `.env` once, not two
places. Run nightly via Task Scheduler:

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Plaridel\plaridel-dashboard\scripts\backup-db.ps1"'
$trigger = New-ScheduledTaskTrigger -Daily -At 6pm
Register-ScheduledTask -TaskName 'Plaridel DB Backup' -Action $action -Trigger $trigger
```

Then **copy the `backups/` folder somewhere off this machine** — OneDrive, a
network share, anywhere. A backup sitting on the only disk that holds the
database is not a backup.

Test a restore once, before you need it:

```
mysql -u root -p rcsni_cost < backups\rcsni_cost_2026-08-04_1800.sql
```

---

## 7. Before handing it over

- **Move the project out of any folder named "Temp"**. `C:\Plaridel\plaridel-dashboard`
  is fine. People delete things called Temp.
- **Remove `db/schema.sql` and `db/load_seed.sql` from her machine**, or move
  them into a `db/setup-only/` folder with a README saying DO NOT RUN. `schema.sql`
  drops every table. Once she has real data, running it once destroys everything.
- **Delete `db/rcsni_cost_clean_*.sql` (the import file from step 1) once the
  import is done.** It's a full plaintext copy of every peso amount and every
  worker's name — the data already lives in MySQL, there's no reason a second
  unencrypted copy sits on disk. Same reasoning as never committing `.env`.
  `etl/` and `db/seed/` are dev-only too; neither is needed once real data is in.
- Keep `.env` on her machine only. Never commit it.
- Set `NODE_ENV=production` in `.env` — nothing in this app's own code branches
  on it, only Express/session internals, so it's safe to set and has no effect
  on cookie behavior here (`secure: false` is hardcoded, not env-conditional).
- Confirm the app still works after a full reboot. That is the real test.

---

## If she ever needs it from a second machine

Bind Express to `0.0.0.0`, open the port in Windows Firewall, and she reaches it
at `http://<pc-name>:4000` from anywhere on the office network. But then it is
multi-user in practice even if not by design, and you need real auth and probably
roles. Out of scope for now — just know the path exists.
