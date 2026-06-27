# Databases — local vs Turso (Netlify)

Two completely separate databases. Changing one does **not** affect the other.

| | **Local (your Mac)** | **Live (Netlify)** |
|---|----------------------|---------------------|
| Storage | `data/tile-logistics.db` | Turso cloud |
| Env flag | `USE_LOCAL_DATABASE=true` in `.env.local` | **never** set this |
| Dev server | `npm run dev` | (deploy only) |
| Seed demo | `npm run seed:local` | `npm run seed` |
| Wipe data | `npm run reset:local` | `npm run reset:turso` |
| Debug live data locally | — | `npm run dev:turso` |

---

## Local development

In `.env.local`:

```env
USE_LOCAL_DATABASE=true
DATABASE_PATH=data/tile-logistics.db
```

Then:

```bash
npm run dev              # uses local SQLite only
npm run seed:local       # demo data in local file
npm run reset:local      # wipe local file
```

Your live Netlify site is **not** touched.

---

## Netlify (production)

In **Netlify → Site settings → Environment variables**, set:

| Variable | Value |
|----------|--------|
| `TURSO_DATABASE_URL` | from Turso CLI (below) |
| `TURSO_AUTH_TOKEN` | from Turso CLI (below) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_USERNAME` | your admin username |
| `ADMIN_PASSWORD` | strong password |

**Do not** set `USE_LOCAL_DATABASE` on Netlify.

Wipe live data without touching local:

```bash
npm run reset:turso
```

---

## Get Turso URL and create a token

Install and log in (once):

```bash
brew install tursodatabase/tap/turso
turso auth login
```

### Show URL + instructions

```bash
npm run turso:info
```

Or manually:

```bash
# List your databases
turso db list

# Print the URL (this is TURSO_DATABASE_URL for Netlify)
turso db show tile-logistics-prod --url
```

Example output:

```text
libsql://tile-logistics-prod-yourorg.aws-eu-west-1.turso.io
```

Copy that entire line into Netlify as `TURSO_DATABASE_URL`.

### Create a new token

```bash
turso db tokens create tile-logistics-prod
```

The CLI prints a JWT **once**. Copy it into Netlify as `TURSO_AUTH_TOKEN`.

To rotate a token, create a new one and update Netlify; old tokens can be revoked in the Turso dashboard.

### New empty database (first deploy or after delete)

```bash
./scripts/setup-turso.sh --fresh
```

This prints the URL and reminds you to run `turso db tokens create`.

---

## Optional: view live data on your Mac

Only when you intentionally want to connect to production Turso:

```bash
npm run dev:turso
```

Requires valid `TURSO_*` in `.env.local`. **Do not** run `reset:local` expecting it to clear Netlify.

---

## Quick reference

```bash
# Local only
npm run dev
npm run seed:local
npm run reset:local

# Live Turso only
npm run turso:info
npm run reset:turso
npm run seed

# Both (rare)
npm run reset:all
```
