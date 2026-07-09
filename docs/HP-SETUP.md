# HP laptop — invoice folder watcher

Use the **HP Windows PC** where Pro-Data saves Excel files. Your **Mac** is for code changes and git push. The HP only **pulls** from GitHub and runs the folder watcher.

---

## Roles

| Machine | Job |
|---------|-----|
| **Mac** | Edit code, `git push`, deploy (Netlify) |
| **HP** | Save Excel invoices, run watcher, optional `git pull` |
| **Any browser** | Orders → Import queue → Approve / Edit / Decline |

The watcher must run on the PC that has the invoice files (`C:\Users\...`). It cannot run on Mac or the cloud site.

---

## One-time setup on HP

### 1. Install Node.js

Download **LTS (20+)** from [https://nodejs.org](https://nodejs.org) and install.

Verify in **Command Prompt** or **PowerShell**:

```bash
node -v
npm -v
```

### 2. Clone the project (once)

```bash
git clone https://github.com/YOUR-ORG/tile-logistics.git
cd tile-logistics
npm install
```

Replace the repo URL with your real GitHub URL.

### 3. Create `.env.local` (once — never commit)

```bash
copy .env.example .env.local
```

Edit `.env.local` in Notepad. Copy values from **Netlify → Site configuration → Environment variables**:

```env
AUTH_SECRET=from-netlify
ADMIN_USERNAME=from-netlify
ADMIN_PASSWORD=from-netlify

TURSO_DATABASE_URL=libsql://....turso.io
TURSO_AUTH_TOKEN=from-netlify
```

**Important for HP:**

- **Do not** set `USE_LOCAL_DATABASE=true` (you want the live Turso database).
- **Do not** commit or push `.env.local` — it stays only on this PC.

You can also copy `.env.local` from your Mac (USB/email). Remove `USE_LOCAL_DATABASE=true` if present.

### 4. Apply database schema (once, or after errors)

After `git pull`, if the watcher shows `no such table: ...`, run:

```bash
npm run turso:apply-schema
```

You should see checkmarks for `delivery_proofs`, `app_settings`, `invoice_import_queue`, etc.

**On Mac only** (if the command above still shows missing tables), with [Turso CLI](https://docs.turso.tech/cli) installed:

```bash
turso auth login
./scripts/setup-turso.sh
```

This is safe — it only creates missing tables; it does **not** delete your orders or data.

### 5. Set invoice folder in the app

1. Open the live site (or `npm run dev` on HP).
2. **Settings → Invoice import folder**
3. Save either:
   - `C:\Users\HP\Documents\Faturat-Logistics` (recommended), or
   - `C:\Users\HP\Documents\Faturat-Logistics\09.07.2026` (date folder directly)

### 6. Folder layout for Pro-Data exports

```
C:\Users\HP\Documents\Faturat-Logistics\
  09.07.2026\
    26-SHV01-001-7200.xlsx
  10.07.2026\
    ...
```

Use date folders `DD.MM.YYYY`. Files must be `.xlsx` (not open in Excel — no `~$` temp files).

---

## Every work day on HP

1. Open terminal in the project folder.
2. Start the watcher (leave window open):

```bash
npm run watch:invoices:turso
```

You should see `Invoice folder watcher` and `Database: Turso (...)` — it keeps running until you press `Ctrl+C`. If you see `'DB_TARGET' is not recognized`, run `git pull` on the HP (Windows fix) and try again.

3. Download/save Excel invoices into today’s date folder.
4. On **any device** (Mac, phone, browser): **Orders → Import queue** → **Approve**, **Edit**, or **Decline**.

Stop the watcher by closing the terminal or `Ctrl+C`.

---

## After you push changes from Mac

On HP:

```bash
git pull
npm install
```

Run `npm install` only if `package.json` changed. Then start the watcher again:

```bash
npm run watch:invoices:turso
```

**Never push from HP** — pull only. That keeps git simple.

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| `TURSO_*` missing | Fill in `.env.local` from Netlify |
| Folder not found | Fix path in **Settings** |
| No pending imports | Check `.xlsx` is in the date folder; watcher running on HP |
| Scan from cloud site does nothing | Normal — cloud cannot read `C:\`. Use watcher on HP |
| `DB_TARGET` not recognized (Windows) | Run `git pull` — watcher uses `--turso` flag now |
| `no such table: delivery_proofs` | On HP: `npm run turso:apply-schema` then restart watcher. On Mac (Turso CLI): `./scripts/setup-turso.sh` |
| Watcher runs but queue stays empty | Path is **typed** in Settings (not uploaded). Excel must be in a `DD.MM.YYYY` subfolder. Check watcher log for `queued N` |

---

## Optional: manual import (no watcher)

On the website: **Orders → Import AGIMI document → Choose Excel**. No Node watcher needed; upload each file by hand.

---

## Security

- `.env.local` is in `.gitignore` — never add it to git.
- Do not share Turso tokens or passwords in chat/email.

See also: [DATABASE.md](./DATABASE.md), [GET-STARTED.md](./GET-STARTED.md).
