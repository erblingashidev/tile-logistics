# Per-company database isolation

## Model

| Layer | What it stores | Who can access |
|--------|----------------|----------------|
| **Control plane** (main `TURSO_DATABASE_URL` / `data/tile-logistics.db`) | Companies, signup queue, admin accounts, employee login index, org settings | Platform super-admin; company admins only their org settings keys |
| **Tenant data** (optional dedicated DB per company) | Orders, employees, vehicles, warehouse, products, logs for that company only | Company admin + employees of that org; super-admin only while “inside” that company in the UI |

Operational API routes resolve the active company from the session (and proxy header), then open either:

1. **Dedicated database** — when `tenant_database_isolated=true` and `tenant_database_url` is set on the organization, or  
2. **Shared database** — same file/Turso as control plane, filtered by `organization_id` (legacy / Netlify default until each company is provisioned).

## New companies

When a signup is **approved**, the app provisions a **local** dedicated SQLite file:

`data/tenants/org-{id}-{slug}.db`

On **Netlify + single Turso**, new companies stay on the shared cluster with strict row-level isolation until you attach a separate Turso database (below).

## Isolate an existing company (e.g. Aurismall)

As platform super-admin:

```http
POST /api/platform/organizations/{id}/provision-database
```

(Local dev: creates `data/tenants/...`. Production Turso: register a dedicated DB manually.)

## Attach a Turso database (production)

1. Create a Turso DB per company (`turso db create aurismall-logistics`).
2. Apply the same schema (run app once locally against that URL or use your schema script).
3. Store credentials in organization settings (platform-only tooling / future UI):
   - `tenant_database_url`
   - `tenant_database_auth_token`
   - `tenant_database_isolated` = `true`

Or call `registerOrganizationDatabase()` from a secured platform script.

## Security rules

- Every tenant API checks session company id vs requested data (`assertSessionCanAccessOrganization`).
- Super-admin must **open** a company before its data APIs work (same as today).
- Employee portal logins for isolated DBs use the **employee_directory** table on the control plane (username → company + employee id).

## AGIMI (org #1)

Stays on the shared database unless you explicitly provision and migrate.
