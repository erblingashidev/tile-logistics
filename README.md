# Tile Logistics System

A full-stack logistics dashboard for managing **tile and adhesive orders**, **vehicle assignments with capacity checks**, **delivery rounds**, **activity logs**, and **Excel exports** grouped by location.

## Quick start

```bash
cd ~/Projects/tile-logistics
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — login defaults to `admin` / `admin` (override via `.env.local`).

**Deploy:** see [docs/GET-STARTED.md](docs/GET-STARTED.md) (git, local DB, free Turso) and [docs/DEPLOY-NETLIFY.md](docs/DEPLOY-NETLIFY.md).

The SQLite database is created automatically at `data/tile-logistics.db` on first run.

---

## What this system does

### Dashboard
Four main modules: **Orders**, **Vehicles**, **Logs**, **Reports**.

### Orders (Invoices)
- Create / edit / delete invoices with: invoice #, customer name, location, price, date
- Add products:
  - **Tiles** — enter dimensions (cm) + quantity in **m²**
  - **Adhesive** — enter weight in **kg**
- **Auto-calculations:**
  - Tile pieces = `ceil(m² / tile_area)`
  - Pallets = `ceil(m² / 50)` (50 m² per pallet — configurable in `src/lib/constants.ts`)
  - Example: **120 m² → 3 pallets**
- Filter orders by date, m², pallets, location, price, search
- **Assign to vehicle** with **Round 1** (first trip) or **Round 2** (return trip)
- **Capacity validation:** if 3 orders already fill 4 pallets on a truck and you add a 4th order that exceeds the vehicle's max pallets or max kg, the system **blocks** the assignment and logs the rejection
- **Export Excel:** all orders, or grouped by location

### Vehicles
- Add / edit / delete vehicles
- Each vehicle has: name, plate, **max weight (kg)**, **max pallets**, status
- Status you control manually: `available`, `on_road`, `returning`, `maintenance`, `offline`
- See **Round 1** and **Round 2** load separately (pallets, kg, order count)

### Logs
- Every create, update, delete, assign, and rejected assignment is logged with timestamp and JSON details

### Reports
- Filter by date and hour range
- Summary cards: order count, total m², pallets, price
- Download filtered data as Excel

---

## Project structure

```
tile-logistics/
├── data/                          # SQLite DB (auto-created, gitignored)
├── src/
│   ├── app/
│   │   ├── page.tsx               # Dashboard (4 buttons)
│   │   ├── orders/page.tsx        # Orders UI
│   │   ├── vehicles/page.tsx      # Vehicles UI
│   │   ├── logs/page.tsx          # Activity logs
│   │   ├── reports/page.tsx       # Reports
│   │   └── api/                   # REST API
│   │       ├── orders/
│   │       ├── vehicles/
│   │       ├── logs/
│   │       ├── reports/
│   │       └── export/
│   ├── components/
│   │   ├── layout/AppShell.tsx
│   │   └── ui/index.tsx
│   └── lib/
│       ├── constants.ts           # M2_PER_PALLET, statuses
│       ├── calculations.ts        # Tile/pallet/capacity math
│       ├── logger.ts
│       ├── db/
│       │   ├── schema.ts          # Drizzle schema
│       │   └── index.ts           # DB connection + migrations
│       ├── services/
│       │   ├── orders.ts
│       │   └── vehicles.ts
│       └── export/excel.ts
├── next.config.ts
└── package.json
```

---

## Database schema

| Table | Purpose |
|-------|---------|
| `orders` | Invoice header + computed totals (m², pieces, pallets, kg) |
| `order_items` | Line items (tile or adhesive) |
| `vehicles` | Fleet with max kg and max pallets |
| `assignments` | Order ↔ vehicle, with `delivery_round` (1 or 2) |
| `activity_logs` | Audit trail |

### Key relationships
- One order → many items
- One order → one assignment per round (unique on `order_id + delivery_round`)
- Capacity is checked **per vehicle per round**

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders?dateFrom=&minPallets=` | List/filter orders |
| POST | `/api/orders` | Create order |
| PUT | `/api/orders/:id` | Update order |
| DELETE | `/api/orders/:id` | Delete order |
| POST | `/api/orders/:id/assign` | Assign vehicle `{ vehicleId, deliveryRound }` |
| GET | `/api/vehicles` | List vehicles + load |
| POST | `/api/vehicles` | Create vehicle |
| PUT | `/api/vehicles/:id` | Update vehicle/status |
| GET | `/api/logs?dateFrom=` | Activity logs |
| GET | `/api/reports?dateFrom=&hourFrom=` | Report data |
| GET | `/api/export?type=orders\|locations` | Download Excel |

---

## How capacity checking works

When you assign order O to vehicle V for round R:

1. Load all other orders already assigned to V in round R
2. Sum their pallets and weight
3. Add order O's pallets and weight
4. Compare against V's `max_pallets` and `max_weight_kg`
5. If either limit is exceeded → **409 error** with message, logged as `assign_rejected`

**Example:** Vehicle holds 8 pallets. Orders A, B, C use 4 pallets total. Order D needs 5 pallets → **blocked** (9 > 8).

Round 1 and Round 2 are independent — when trucks return for the second trip, assign to **Round 2**.

---

## Configuration

Edit `src/lib/constants.ts`:

```typescript
export const M2_PER_PALLET = 50;        // m² per pallet
export const KG_PER_TILE_PALLET = 750;  // estimated kg per tile pallet (for weight limit)
```

---

## Production deployment

1. **Build:** `npm run build && npm start`
2. **Database:** SQLite file persists in `data/` — back it up regularly
3. For multi-user production, consider migrating to **PostgreSQL** (Drizzle supports it) and adding authentication
4. Deploy to Vercel/Railway/Docker — ensure `better-sqlite3` native binary matches the server OS

### Docker (optional)

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Example workflow

1. Add vehicles (e.g. Truck A: 8 pallets, 3500 kg)
2. Create order: Invoice INV-001, Location "Tirana Center", 120 m² tiles 60×60 cm
   - System calculates: ~334 pieces, **3 pallets**
3. Assign to Truck A, **Round 1**
4. Add more orders to same truck until pallet/kg limits hit
5. When truck leaves → set status **on_road**
6. Prepare second-wave orders → assign with **Round 2**
7. Export **By Location** Excel for warehouse picking lists
8. Check **Logs** for the day's activity

---

## Tech stack

- **Next.js 16** (App Router, API routes)
- **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **SQLite** + **better-sqlite3** + **Drizzle ORM**
- **xlsx** for Excel export
- **date-fns** for date formatting

---

## Next steps you might add

- User login / roles
- PDF invoice upload (OCR)
- SMS notifications when vehicle is on road
- Map view by location
- PostgreSQL for cloud hosting
- Mobile-friendly PWA for drivers
