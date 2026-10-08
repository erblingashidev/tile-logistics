# Multi-tenancy architecture — Logistics Core

This document maps the **existing codebase** to the multi-tenant SaaS specification, records gaps, and defines a **phased implementation plan**. Terminology: the spec’s **company** is implemented as **`organization`** (`organization_id` in the database).

---

## 1. Inspection summary (current stack)

| Area | Current state |
|------|----------------|
| **Frontend** | Next.js 16 App Router, React, `(admin)` / `(portal)` / `platform` route groups |
| **Backend** | Next.js Route Handlers (`src/app/api/**`) + server components |
| **Database** | SQLite (local/Docker) or Turso (libSQL); Drizzle ORM + runtime patches in `src/lib/db/index.ts` |
| **Auth** | HMAC-signed cookie session (`agimi_session`); admins + employees |
| **Tenant key** | `organizations.id` → column **`organization_id`** (not `company_id`) |
| **Platform admin** | `admins.is_platform_admin`; `PLATFORM_OWNER_USERNAME`; routes under `/platform/*` |
| **Company admin** | `admins.organization_id` + `is_platform_admin = 0` |
| **Employees** | JSON `roles` array (operational RBAC); not a separate `permissions` table |
| **URLs** | `/{slug}/orders`, …; global `/login`, `/platform/companies` |
| **Tests** | Vitest (unit); **no tenant-isolation integration tests yet** |

---

## 2. What already matches the spec

### Hierarchy (people)

- **Super Admin** → platform admin (`is_platform_admin`, optional `organization_id` null until “Open company”).
- **Company** → `organizations` row (signup → approve → owner admin).
- **Company Admin** → `admins` pinned to one `organization_id`.
- **Employees** → `employees` with role strings (CEO, picker, driver, sales, …).

### Platform vs company

- `/platform/companies`, `/platform/applications`, `/api/platform/*` for super admin.
- Company ops under `/{slug}/…` after tenant session is set.
- `requirePlatformAdmin()`, company picker, `switch-organization` / `leave-organization`.

### Tenant context & security (partial)

- `resolveSessionOrganizationId`, `resolveTenantOrganizationId()` (session + `x-organization-id` / `x-organization-slug` headers from proxy).
- `assertSessionCanAccessOrganization` on **`requireApiTenantSession`**.
- **`runApiCompanyAdmin`** used on **employees** and **company profile** APIs only (as of audit).
- Edge **`src/proxy.ts`** avoids DB; slug forwarded for Node resolution.

### Shared-schema isolation (partial)

Tables with **`organization_id`** in Drizzle schema include at least:

- `orders`, `vehicles`, `employees`, `products`, `activity_logs`, `invoice_import_queue`

Runtime backfill assigns legacy rows to **org #1 (AGIMI)**. Unique indexes:

- `(organization_id, invoice_number)` on orders  
- `(organization_id, plate_number)` on vehicles  

### Signup / onboarding

- Public signup → `organization_applications` → approve creates org, company admin, profile/modules, tenant DB provision (environment-dependent).

### Optional physical isolation

- **Dedicated DB per org** (`tenant-database.ts`, `data/tenants/…` or Turso Platform API) — **stronger than shared-schema**, but **not** the spec’s default model. On shared Turso without dedicated DB, row-level `organization_id` is required.

### Audit

- `activity_logs` with `organization_id`; `logActivity()` used in places (e.g. settings).

### Feature flags / company settings

- `organization_settings` + company profile JSON (modules: logistics, WMS, …).

---

## 3. Architectural tension (must decide)

| Spec default | Current code |
|--------------|--------------|
| **One database, shared schema, every row has `company_id`** | **Hybrid**: shared control plane + optional **separate SQLite/Turso DB per org** for operational data |
| Implicit scope via `organization_id` on all queries | When isolated DB is used, scope is **database boundary**; when shared, **`organization_id` filters** |

**Recommendation for SaaS spec compliance:**

1. Treat **`organization_id` as the canonical tenant key** everywhere (alias mentally to `company_id`).
2. **Primary production mode for multi-tenant SaaS:** shared schema + strict query scoping (spec-aligned).
3. Keep **optional dedicated DB** as an enterprise/isolation add-on, not a substitute for authorization.
4. Do **not** duplicate tables per company (`company_a_orders`).

---

## 4. Gap analysis vs specification

### Database — tables missing `organization_id` (shared-mode risk)

These are **global or org-agnostic in schema** today; on a **shared** database they can leak across tenants unless isolated by separate DB:

| Table / area | Risk |
|--------------|------|
| `warehouse_locations` | Global unique `code`; no org column |
| `stock_balances`, `stock_movements` | Scoped only via product/location FKs |
| `product_aliases` | No org column |
| WMS: `inventory_*`, `warehouse_reports*`, `customer_returns*` | Mostly no `organization_id` |
| `assignments`, `order_items`, `delivery_proofs*` | Child of order; OK if orders are org-scoped and IDs not guessable cross-tenant |
| `vehicle_maintenance_records`, `vehicle_round_defaults` | Via vehicle only |
| `employee_notifications` | No org column |
| `app_settings` | Legacy global; AGIMI mirrors into org settings |

**Action:** Phase 3 — add `organization_id` + backfill + composite uniques/indexes per spec §9–§25.

### Company model fields (spec §3)

`organizations` today: `slug`, `name`, `status`, timestamps.

**Missing (optional columns / settings):** `legal_name`, `registration_number`, `tax_number`, email, phone, address, city, country, logo, `trial`/`inactive` semantics, soft delete, subscription placeholders (§31).

**Action:** Extend org profile / columns incrementally; map status enum to ACTIVE | SUSPENDED | TRIAL | INACTIVE.

### RBAC / permissions (spec §12–§14)

- **Today:** Employee `roles` JSON + admin vs employee + platform flag; feature flags for modules.
- **Not today:** `permissions`, `role_permissions`, `user_roles` tables; granular keys like `orders.assign`.

**Action:** Phase 5 — introduce RBAC layer **mapping existing employee roles** to permission sets before rewriting UI.

### Warehouse-level access (spec §15)

- **Partial:** `employee_warehouse_zones` (zone string, one leader per zone).
- **Not:** general `employee_warehouses` / location-level ACL for all roles.

**Action:** Phase 5b — extend after company isolation is solid.

### API security (spec §19)

~**86** API route files; only **employees** + **company/profile** use **`runApiCompanyAdmin`**.

Many routes use `requireApiAdmin` + services that call `resolveTenantOrganizationId()` — **works only if tenant is bound** and services **always filter**.

**Gaps:**

- Platform admin without selected org may get errors vs 403 consistently.
- Services without org filters (e.g. **stock/WMS**) on shared DB.
- IDOR: fetch by numeric id without verifying org ownership on every mutation.

**Action:** Phase 6 — standardize on `runApiCompanyAdmin` / `requireApiTenantSession` + repository helpers `forCurrentOrganization()`.

### Frontend (spec §20, §34–§35)

- Slug-based URLs exist; platform picker exists.
- **Missing:** consistent “PLATFORM ADMIN — Viewing: {Company}” banner; `/platform/*` vs `/{slug}/*` matches spec intent but naming differs from `/company/*`.

**Action:** Phase 7 — UX indicators, no forced URL rewrite.

### Tests (spec §26)

- **No** automated cross-tenant API tests.

**Action:** Phase 10 — Vitest + test DB fixtures (org A / org B).

### Migrations (spec §24)

- Runtime `ensure*` patches in `getControlPlaneDb()` bootstrap; `scripts/turso-schema.sql`.
- Need **documented, idempotent migration scripts** for new `organization_id` columns and backfill.

---

## 5. Target model (aligned with spec, adapted names)

```
PLATFORM
└── SUPER ADMIN (admins.is_platform_admin = 1)
    ├── organizations (companies)
    │   ├── organization_settings / profile / modules
    │   ├── admins (company admin)
    │   └── operational data (organization_id OR dedicated tenant DB)
    │       ├── employees
    │       ├── orders → order_items, assignments, proofs
    │       ├── vehicles
    │       ├── products → stock, movements
    │       ├── warehouse_locations, inventory, reports
    │       └── activity_logs
    └── organization_applications (signup queue)
```

**Login flow (conceptual):**

```
LOGIN → session(role, organizationId?, organizationSlug?)
     → proxy sets x-organization-id | x-organization-slug
     → resolveTenantOrganizationId() on server
     → getTenantDataDb() + queries filtered by organization_id
     → assertSessionCanAccessOrganization on sensitive APIs
```

**Never trust client-supplied `organization_id` for authorization** — only session + server-resolved tenant.

---

## 6. Phased implementation plan

| Phase | Spec sections | Work |
|-------|---------------|------|
| **1 — Document** | §36 Step 2 | This file; keep TENANT-DATABASES.md / HOSTING-SELF.md in sync |
| **2 — Tenant schema** | §9, §10, §25 | **In progress:** `tenant-org-columns.ts` + Drizzle columns for WMS; stock service scoped; warehouse locations API uses `runApiCompanyAdmin` |
| **3 — Company entity** | §3, §16, §31 | Extend org fields/status; settings UI; subscription placeholder columns |
| **4 — Auth context** | §6, §7 | Ensure every server path binds tenant; fix API tenant resolution for platform admin + slug header |
| **5 — Authorization** | §12–§14 | Permission catalog + map from existing `EmployeeRole`; enforce on API |
| **5b — Warehouse ACL** | §15 | Location/zone assignments beyond group leaders |
| **6 — API audit** | §19, §39–§40 | Migrate routes to `runApiCompanyAdmin`; IDOR checks on `:id` routes |
| **7 — Frontend** | §20, §34–§35 | Platform banner, company header, hide platform nav for company admins |
| **8 — Super / company admin** | §4, §5, §23 | Platform stats, suspend org, reset admin; polish onboarding |
| **9 — Audit log** | §17 | Expand `logActivity` coverage for spec actions |
| **10 — Tests** | §26 | Cross-tenant isolation test suite (mandatory) |
| **11 — Validation** | §42 | Build, lint, manual regression AGIMI + second test org |

Work **incrementally**; after each phase: build + targeted tests.

---

## 7. Acceptance checklist (spec §42)

Use this as the living gate. Current rough status:

| Criterion | Status |
|-----------|--------|
| Multiple companies | ✅ Signup + approve |
| Company admin per company | ✅ On approve |
| Company admin scoped to own org | ⚠️ Mostly; API audit incomplete |
| Super admin all companies | ✅ Platform routes |
| Users cannot access other companies’ data | ⚠️ Dedicated DB helps; shared DB needs WMS + API hardening |
| `organization_id` from auth, not client | ⚠️ Session-based; not all APIs enforce |
| Warehouses/products/inventory/orders company-scoped | ⚠️ Partial schema |
| Central RBAC | ❌ Roles only |
| Warehouse-level access | ⚠️ Zones partial |
| Tenant isolation tests | ❌ |
| Existing data preserved | ✅ Backfill to org #1 pattern |
| Build passes | ✅ (verify each phase) |

---

## 8. Conflicts / do not do

- **Do not** rebuild warehouse/logistics modules from scratch.
- **Do not** create per-company table names (`company_a_orders`).
- **Do not** rely on frontend-only hiding.
- **Do not** remove optional dedicated DB support without product decision — but **do** enforce auth even with dedicated DB.
- **Rename** `organization` → `company` in DB only if worth a large migration; prefer **documentation alias**.

---

## 9. Related docs

- [TENANT-DATABASES.md](./TENANT-DATABASES.md) — control plane vs tenant DB files  
- [HOSTING-SELF.md](./HOSTING-SELF.md) — Docker / no Turso  
- [DEPLOY-NETLIFY.md](./DEPLOY-NETLIFY.md) — Netlify constraints  

---

*Last updated from codebase audit: multi-tenant SaaS specification review.*
