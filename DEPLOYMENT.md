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

### 1b. Import the data

The single file to bring to a new machine is **`db/rcsni_cost_clean_2026-08-06.sql`**
— a full dump of the schema *and* the real, corrected project data (every
migration through `015_cash_advances_control_no.sql` already applied, no
test/sample rows left active). Nothing else under `db/` needs to run —
not `schema.sql`, not `load_seed.sql`, not anything in `db/migrations/`.
Those are dev-bootstrap and history, already baked into this one file.

The file is self-contained (it creates the `rcsni_cost` database itself
via `CREATE DATABASE IF NOT EXISTS` + `USE`) — don't create the database
first, that's redundant. Just run:

```powershell
Get-Content db\rcsni_cost_clean_2026-08-06.sql | mysql -u root -p
```

Git Bash / Mac / Linux:

```bash
mysql -u root -p < db/rcsni_cost_clean_2026-08-06.sql
```

Note there's **no database name after `-p`** on either command — the file
selects it itself. Passing one anyway doesn't hurt, but it's unnecessary.

**Using MySQL Workbench instead of the command line:** Server → Data
Import/Restore → "Import from Self-Contained File" → browse to this
`.sql` → Start Import. Don't set a "Default Target Schema" — the file
already declares its own database, and older exports that didn't
(pre-2026-08-06) fail in Workbench with `ERROR 1046: No database selected`
because Workbench's restore doesn't select one for you the way passing a
database name on the CLI does.

**This file goes stale the moment real data changes again** (a
correction, a new migration, a week of her using the app). Before any
future deployment, regenerate it from whichever database is currently
live and correct — either:

```bash
mysqldump -u root -p --routines --triggers --single-transaction --databases rcsni_cost > db/rcsni_cost_clean_<today>.sql
```

(the `--databases` flag matters — it's what makes the file self-contained
for Workbench; leaving it off reproduces the exact error above) — or just
click **"Backup now"** in the app itself (top of every screen), which
already uses `--databases` under the hood. Either way, that fresh file is
what you import on the new machine, not this dated one.

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

## 8. Running a second site (e.g. Villasis)

This app now supports more than one independent deployment of the same
codebase — one per site, each with its own database, its own port, and no
shared state between them. `schema.sql` already seeds both projects the
schema was designed around: `PLAEX` (Plaridel Extension, id 1) and `DSEXP`
(Dry Storage Expansion / Villasis, Pangasinan, id 2), with their real,
accounting-confirmed company/location/TIN. Each site's deployment picks
which one it points at.

What that means concretely, once both sites run on the same PC:

| Layer | Count | Detail |
|---|---|---|
| GitHub repo | **one** (`ledger-lab`) | same origin, same commit history, both sites pull from it |
| Folder / git checkout | **two** | e.g. `C:\Plaridel\plaridel-dashboard` and `C:\Villasis\villasis-dashboard` — two clones of that one repo |
| Database | **two** | `rcsni_cost` and `rcsni_villasis`, both on the same local MySQL server |
| Node/Express process | **two** | each folder's own `node index.js`, on its own port (4000 / 4001) |
| Desktop shortcut | **two** | `start-plaridel.bat` and `start-villasis.bat`, one per site |

Not two GitHub repos (that forks the codebase — a bug fix wouldn't reach both
sites automatically) and not one folder trying to serve both (that's exactly
why `site.config.ts` and both `.env` files are gitignored per checkout —
see below).

**The one file to edit per site, frontend side:** copy
`client/src/site.config.example.ts` to `client/src/site.config.ts` (this file
is gitignored, same reason `.env` is right next to it — every checkout needs
its own values, and if it were a tracked file, `git pull`-ing shared code
fixes into either site would fight over the other site's `PROJECT_ID`/
branding) and fill in this site's values:

```ts
export const PROJECT_ID = 2;                          // DSEXP for Villasis
export const SITE_NAME = 'Villasis';
export const SITE_TITLE = 'Royale Cold Storage — Villasis';
```

Every other frontend file (`Layout.tsx`, `Login.tsx`, the browser tab title,
every data hook) reads from it — nothing else needs touching for a new site.

**Steps for a new site, start to finish:**

1. **Clone the same repo** into its own folder — don't create a second
   GitHub repo, and don't reuse Plaridel's working copy as a branch:
   ```powershell
   git clone https://github.com/melvin-balajadia/ledger-lab.git C:\Villasis\villasis-dashboard
   ```
   One repo, one commit history — a bug fix pushed from either site's
   checkout is a plain `git pull` away in the other. `site.config.ts` and
   both `.env` files are gitignored, so pulling shared code never touches
   either site's own identity/credentials.
2. **Create a separate database.** `schema.sql` hardcodes the database name
   `rcsni_cost` in its `CREATE DATABASE`/`USE` lines — don't edit the file,
   substitute the name at import time instead:
   ```powershell
   (Get-Content db\schema.sql) -replace 'rcsni_cost','rcsni_villasis' | mysql -u root -p
   ```
3. **Import the seed-only master data** — `db/seed_master_data.sql`. It
   removes Plaridel's project row and its 20 budget_items (this deployment
   has no business carrying Plaridel's budget figures) and the Plaridel-only
   FX rates, then loads `users` (same login as this deployment — same user),
   `suppliers` (the existing 324-name list), and `planning_lines` (this
   site's starting JPL codes, re-pointed at `project_id = 2`):
   ```powershell
   mysql -u root -p rcsni_villasis < db\seed_master_data.sql
   ```
   Read the comment block at the top of that file — it explains exactly what
   it does and why (including why `budget_item_id` comes across as `NULL`).
   Regenerate it later with `mysqldump --no-create-info` if you need a fresh
   snapshot of `users`/`suppliers`/`planning_lines`.
4. **`server/.env`** in the new folder — its own `DB_NAME=rcsni_villasis`,
   its own `PORT` (e.g. `4001`, since both sites may run on the same
   machine), its own `SESSION_SECRET`.
5. **`client/.env`** — `VITE_API_URL` pointing at that port.
6. **`client/src/site.config.ts`** — copy from `site.config.example.ts` (see
   above) and set `PROJECT_ID = 2`, plus `SITE_NAME`/`SITE_TITLE`.
7. **`scripts/start-villasis.bat`** — already in the repo (tracked, so it
   arrived with the clone in step 1), a copy of `start-plaridel.bat` with the
   title and the `start http://localhost:4001` line changed to match. The
   `cd /d "%~dp0..\server"` line needs no edit — it's relative to the batch
   file's own location, so it already resolves to *this* checkout's
   `server/`. Point her desktop shortcut at this file instead of
   `start-plaridel.bat`.
8. Follow sections 1d–7 above (build, service, backups, handoff) exactly as
   for the first site, just in the new folder against the new database/port — using
   `start-villasis.bat` in place of `start-plaridel.bat` in section 4, and
   `http://localhost:4001` in place of `:4000` in sections 4 and 5.

Result: two fully independent instances, same repo, no cross-talk. A third
site later repeats steps 1–7 with a new database name, port, its own
`site.config.ts` (from the example), and a new `.bat` script (copy
`start-villasis.bat`, change the title and port) — nothing else changes.

---

## If she ever needs it from a second machine

Bind Express to `0.0.0.0`, open the port in Windows Firewall, and she reaches it
at `http://<pc-name>:4000` from anywhere on the office network. But then it is
multi-user in practice even if not by design, and you need real auth and probably
roles. Out of scope for now — just know the path exists.
