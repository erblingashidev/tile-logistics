# Pro-Data (Finance+) integration

Your sales system is **Pro-Data Finance+** from [prodata-ks.com](https://prodata-ks.com/).

## Can we connect via API?

**Not out of the box today.** Pro-Data does not publish a public REST API in their marketing materials. Their stack is:

- **Finance+** — desktop ERP (material + finance)
- **Phone+** — mobile sales app synced to Finance+
- **MIS app** — dashboards linked to Finance+

Integrations are typically arranged **directly with Pro-Data** (custom export/import or ODBC/SQL access to their database). Contact: **+383 49 289 082** (sales) or **info@prodata-ks.com**.

## What we built instead (phase 1)

This app learns products and stock **without** a live Pro-Data API:

| Source | What gets registered |
|--------|----------------------|
| AGIMI PDF/Excel invoice import | EAN + name + m² + tile size → product catalog + orders |
| New order (manual) | Same, on save |
| Truck unload (`/warehouse/stock` or `/portal/wms`) | EAN + m² (location optional → STAGING) |
| Putaway (move between bins) | Same product can hold different m² in different locations |
| **Pro-Data stock Excel** (every ~2 days) | Snapshot of Barkodi × Lokacioni × Sasia → `stock_balances` |
| Annual inventory | EAN + m² → catalog + stock on close |

### Pro-Data stock Excel

Export the warehouse stock report from Finance+ (columns: **Shifra**, **Barkodi**, **Emertimi**, **Njesia Matese Baze**, **Lokacioni**, **Sasia**).

Admin: **Warehouse → Stock → Import Pro-Data .xlsx**

- Same barcode in two places (e.g. 51 m² + 39 m²) becomes two balance rows.
- Only Pro-Data warehouse areas are overwritten; fine bin putaway locations are left alone.
- Negative book quantities are clamped to 0.

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
