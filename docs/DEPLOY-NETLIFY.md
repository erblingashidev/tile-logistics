# Deploy Tile Logistics to Netlify

This app is a **Next.js 16** full-stack project (admin dashboard + employee portal + API routes). Netlify supports it with zero extra plugins.

## Production database — choose one

### Option A — Railway (easiest, works today)

No code changes. Persistent disk for SQLite + uploads.

1. Push repo to GitHub
2. [railway.app](https://railway.app) → New project → Deploy from GitHub
3. Set **Start command**: `npm start`
4. Add env vars: `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
5. Add a **Volume** mounted at `/app/data` (Railway dashboard → service → Volumes)
6. Set `DATABASE_PATH=/app/data/tile-logistics.db` and `UPLOAD_ROOT=/app/data/uploads`

### Option B — Netlify + Turso (serverless)

Netlify does not keep local files between deploys. Use **Turso** for the database (schema in `scripts/turso-schema.sql`).

> **Note:** Full Turso runtime support in the app is in progress. For a production system today, use **Option A (Railway)**. Netlify steps below get the site online; connect Turso env vars when the adapter is enabled.

---

## Deploy to Netlify

```bash
cd ~/Projects/tile-logistics
git init   # if not already a repo
git add .
git commit -m "Prepare for Netlify deploy"
git remote add origin https://github.com/YOUR_USER/tile-logistics.git
git push -u origin main
```

---

## Step 2 — Create a Turso database (production data)

1. Install Turso CLI: https://docs.turso.tech/cli
2. Sign up / log in:

```bash
turso auth login
turso db create tile-logistics-prod
turso db show tile-logistics-prod --url
turso db tokens create tile-logistics-prod
```

3. Apply the schema (from project root):

```bash
turso db shell tile-logistics-prod < scripts/turso-schema.sql
```

Save the **database URL** and **auth token** for Netlify env vars.

---

## Step 3 — Connect Netlify

1. Go to [https://app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Choose **GitHub** and select `tile-logistics`
3. Netlify should auto-detect **Next.js**. Confirm:

| Setting | Value |
|---------|--------|
| Build command | `npm run build` |
| Publish directory | *(leave empty — Netlify OpenNext sets this)* |
| Node version | `20` (already in `netlify.toml`) |

4. **Do not deploy yet** — add environment variables first.

---

## Step 4 — Environment variables

In Netlify: **Site configuration → Environment variables → Add variables**

| Variable | Example | Required |
|----------|---------|----------|
| `AUTH_SECRET` | long random string (32+ chars) | Yes |
| `ADMIN_USERNAME` | `admin` | Yes |
| `ADMIN_PASSWORD` | your strong password | Yes |
| `TURSO_DATABASE_URL` | `libsql://…` from Turso | Yes (production) |
| `TURSO_AUTH_TOKEN` | token from Turso | Yes (production) |
| `NODE_ENV` | `production` | Set automatically on Netlify |

Generate a secret:

```bash
openssl rand -base64 32
```

---

## Step 5 — Deploy

Click **Deploy site**. First build takes a few minutes (`better-sqlite3` compiles native code on Netlify’s Linux builders).

When finished, open your site URL → **Login** with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

---

## Step 6 — After deploy

1. Add your real **vehicles** and **employees** (portal users need username + password on each employee).
2. Import orders from AGIMI PDFs or create them manually.
3. Optional: **Domain** → Site configuration → Domain management → add your custom domain.

---

## Local Netlify simulation (optional)

```bash
npm install -g netlify-cli
netlify login
netlify dev
```

Copy `.env.example` → `.env.local` and fill in values. For local dev, Turso is optional — SQLite in `data/` is used by default.

---

## Troubleshooting

### Build fails on `better-sqlite3`

- Node 20 is required (`netlify.toml` sets this).
- Clear cache: Netlify → Deploys → **Clear cache and retry**.

### Login works but data disappears after redeploy

- You are not using Turso — set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

### PDF import fails

- `pdf-parse` is bundled for Node runtime; ensure API routes keep `export const runtime = "nodejs"` (already set).

### Employee proof photos

- Uploads go to `UPLOAD_ROOT` on disk. On Netlify this is ephemeral. For production photo storage, plan S3/Cloudinary/Netlify Blobs (not configured yet).

---

## Files added for Netlify

- `netlify.toml` — build command and Node 20
- `.env.example` — required variables
- `scripts/turso-schema.sql` — schema to load into Turso
- `src/lib/config/env.ts` — production env handling
