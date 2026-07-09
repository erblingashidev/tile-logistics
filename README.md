# Tile Logistics

Warehouse and delivery operations for AGIMI tile distribution.

## Two databases (local vs live)

| | Local Mac | Netlify (live) |
|---|-----------|----------------|
| Storage | `data/tile-logistics.db` | Turso |
| Run app | `npm run dev` | deploy |
| Demo data | `npm run seed:local` | `npm run seed` |
| Wipe | `npm run reset:local` | `npm run reset:turso` |

Full guide: **[docs/DATABASE.md](docs/DATABASE.md)**

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # USE_LOCAL_DATABASE=true is already there
npm run dev                    # → http://127.0.0.1:3000
```

## Turso URL + token (for Netlify)

```bash
turso auth login
npm run turso:info
```

Copy the URL to Netlify → `TURSO_DATABASE_URL`.  
Create token: `turso db tokens create tile-logistics-prod` → Netlify → `TURSO_AUTH_TOKEN`.

## Netlify env vars

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`  
**Do not** set `USE_LOCAL_DATABASE` on Netlify.

See [docs/DEPLOY-NETLIFY.md](docs/DEPLOY-NETLIFY.md).

## HP laptop (invoice folder watcher)

Pro-Data Excel auto-import on Windows: **[docs/HP-SETUP.md](docs/HP-SETUP.md)** — pull only on HP, push from Mac.
