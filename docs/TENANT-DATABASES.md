# Per-company database isolation

## Model

| Layer | What it stores | Who can access |
|--------|----------------|----------------|
| **Control plane** (main `TURSO_DATABASE_URL` / `data/tile-logistics.db`) | Companies, signup queue, admin accounts, employee login index, org settings | Platform super-admin; company admins only their org settings keys |
| **Tenant data** (dedicated DB per company) | Orders, employees, vehicles, warehouse, products, logs for that company only | Company admin + employees of that org; super-admin only while “inside” that company in the UI |

Operational API routes resolve the active company from the session (and proxy header), then open either:

1. **Dedicated database** — when `tenant_database_isolated=true` and `tenant_database_url` is set on the organization, or  
2. **Shared database** — same Turso as control plane, filtered by `organization_id` (only when Platform API env vars are missing).

## Automatic provisioning (production)

When **`TURSO_ORGANIZATION`** and **`TURSO_PLATFORM_TOKEN`** are set on Netlify:

1. You **approve** a signup → the app creates `logistics-core-{slug}` (prefix configurable) in Turso, mints a DB token, runs schema bootstrap, and saves URL/token on the company.
2. Company **finishes onboarding** or **updates Settings** → the app retries if the first step failed (`tenant_database_provision_error` in org settings).

Required Platform token scopes: **`db:create`**, **`db:mint-token`** (group-scoped token on your Turso group is fine).

Control plane stays on **`TURSO_DATABASE_URL`** (e.g. `logistics-core-prod`). Each company gets its **own** Turso database name.

### Netlify env checklist

| Variable | Purpose |
|----------|---------|
| `TURSO_DATABASE_URL` | Control plane database |
| `TURSO_AUTH_TOKEN` | Token for control plane |
| `TURSO_ORGANIZATION` | Turso org slug (`turso org list`) |
| `TURSO_PLATFORM_TOKEN` | API token to create/mint tenant DBs |
| `TURSO_GROUP` | Optional, default `default` |
| `TURSO_TENANT_DB_PREFIX` | Optional, default `logistics-core-` |

## Local development

Without Platform API vars, approved companies get a SQLite file:

`data/tenants/org-{id}-{slug}.db`

## Manual / repair

Platform super-admin:

```http
POST /api/platform/organizations/{id}/provision-database
```

Or attach an existing Turso DB with `registerOrganizationDatabase()` (secured script).

## Company settings vs database

Module toggles (logistics, warehouse, etc.) live in **control plane** org settings and gate the UI. The tenant database is created with the **full operational schema** so any module the company enables later works without a second migration.

## Security rules

- Every tenant API checks session company id vs requested data (`assertSessionCanAccessOrganization`).
- Super-admin must **open** a company before its data APIs work (same as today).
- Employee portal logins for isolated DBs use the **employee_directory** table on the control plane (username → company + employee id).

## AGIMI (org #1)

Stays on the shared control-plane database unless you explicitly provision and migrate.
