# Pro-Data (Finance+) integration

Your sales system is **Pro-Data Finance+** from [prodata-ks.com](https://prodata-ks.com/).

## Can we connect via API?

**Not out of the box today.** Pro-Data does not publish a public REST API in their marketing materials. Their stack is:

- **Finance+** — desktop ERP (material + finance)
- **Phone+** — mobile sales app synced to Finance+
- **MIS app** — dashboards linked to Finance+

Integrations are typically arranged **directly with Pro-Data** (custom export/import or ODBC/SQL access to their database). Contact: **+383 49 289 082** (sales) or **info@prodata-ks.com**.

## What we built instead (phase 1)

This app learns products and stock **without** Pro-Data initially:

| Source | What gets registered |
|--------|----------------------|
| AGIMI PDF import | EAN + name + m² + tile size → product catalog |
| New order (manual) | Same, on save |
| Truck unload (`/portal/wms`) | EAN + m² + warehouse location → stock |
| Annual inventory | EAN + m² (name optional) → catalog + stock on close |

Admin: **Warehouse** in the sidebar — products, stock, inventory sessions.

## Possible Pro-Data paths (when you talk to them)

Ask Pro-Data which of these they support for your Finance+ license:

1. **SQL / ODBC read** — nightly sync of article master (EAN, name, stock qty) into Turso
2. **CSV/XML export** — scheduled file drop (OneDrive/FTP) imported by a script
3. **Custom API** — they build a small HTTP service (common for local ERP vendors)
4. **Invoice-only** — keep sales in Pro-Data; logistics app only imports AGIMI PDFs (current flow)

## Suggested sync fields (when API exists)

| Pro-Data field | Our `products` table |
|----------------|----------------------|
| Article code / barcode | `ean` |
| Description | `productName` |
| Unit / m² | used for validation |
| Warehouse qty | `stock_balances.quantity_m2` |

## Environment variables (future)

When an integration exists, add to Netlify / `.env.local`:

```env
PRODATA_API_URL=
PRODATA_API_KEY=
PRODATA_SYNC_CRON=0 2 * * *
```

Code hook: `src/lib/integrations/prodata.ts` (placeholder — implement after Pro-Data confirms format).
