# Self-hosted Logistics Core (your domain, no Turso)

This is the **recommended** production setup if you want:

- Your **real domain** on a normal hosting company (VPS, dedicated server, Plesk Docker, etc.)
- **No third-party database** (no Turso account)
- **Automatic database per company** when you approve a signup

The app stores data in **SQLite files on disk**:

| File | Purpose |
|------|---------|
| `/data/tile-logistics.db` | Control plane — companies, admins, signup queue, login index |
| `/data/tenants/org-{id}-{slug}.db` | That company’s operational data (created on approve) |

You only need the server, a persistent disk, and HTTPS in front (Caddy, Nginx, or your host’s panel).

## Quick start (Docker)

On the server:

```bash
git clone https://github.com/erblingashidev/tile-logistics.git
cd tile-logistics
cp .env.example .env
# Edit .env: AUTH_SECRET, ADMIN_PASSWORD, PLATFORM_OWNER_USERNAME
docker compose up -d --build
```

Open `http://SERVER_IP:3000` (or put a reverse proxy on your domain → port 3000).

**Do not set** `TURSO_DATABASE_URL` or `TURSO_*` on self-hosted — leave them unset.

## Environment variables (self-hosted)

| Variable | Required | Notes |
|----------|----------|--------|
| `AUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Yes | Bootstrap platform admin if DB is empty |
| `PLATFORM_OWNER_USERNAME` | Recommended | Your login always sees company picker |
| `DATABASE_PATH` | Default `/data/tile-logistics.db` in Docker |
| `UPLOAD_ROOT` | Default `/data/uploads` in Docker |

## Custom domain

1. Point DNS `A` / `AAAA` to your server.
2. Terminate TLS with **Caddy** or **Nginx** → `http://127.0.0.1:3000`.
3. Keep the `/data` volume backed up (companies + uploads live there).

## What happens when a company is approved

Same as local dev:

1. Row in control DB for the organization.
2. New file `data/tenants/org-{id}-{slug}.db` with full schema.
3. Company admin can log in and use modules from **Settings** (stored on control plane).

No manual database step.

## Netlify vs self-hosted

| | Netlify | Self-hosted Docker |
|--|---------|-------------------|
| SQLite on disk | No (serverless) | Yes |
| Turso required | Yes for persistent data | No |
| Per-company auto DB | Turso Platform API | Automatic SQLite files |
| Custom domain | Yes | Yes (you configure proxy) |

If Netlify deploy fails on plugins or you do not want Turso, **use this guide instead of Netlify**.

## Backups

Copy the whole `/data` directory regularly (control DB + `tenants/` + `uploads/`).
