# Get started — Git, local database, free Turso

## 1. Git (first time only)

The project was not a git repo before. Run these in Terminal:

```bash
cd ~/Projects/tile-logistics

# Initialize git (if you see "not a git repository")
git init
git add .
git commit -m "Initial commit — tile logistics"
```

### Push to GitHub

1. Create a new repo at [github.com/new](https://github.com/new) named `tile-logistics` (**do not** add README or .gitignore).
2. Then run (replace `YOUR_GITHUB_USER`):

```bash
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USER/tile-logistics.git
git push -u origin main
```

---

## 2. Local database (free, on your Mac)

No signup needed. Start the app:

```bash
cd ~/Projects/tile-logistics
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) — login **admin** / **admin** (or values from `.env.local`).

The database file is created automatically at `data/tile-logistics.db`.

Optional — copy env template:

```bash
cp .env.example .env.local
```

---

## 3. Free cloud database (Turso) for Netlify

For production on Netlify you need a hosted database. **Turso** has a free tier.

### Install Turso CLI

```bash
brew install tursodatabase/tap/turso
turso auth login
```

### Create database and apply schema

```bash
cd ~/Projects/tile-logistics
chmod +x scripts/setup-turso.sh
./scripts/setup-turso.sh
```

### Create access token

```bash
turso db tokens create tile-logistics-prod
```

Copy the token — it is shown only once.

### Save credentials locally (optional test)

Add to `.env.local`:

```
TURSO_DATABASE_URL=libsql://your-db-url-from-script
TURSO_AUTH_TOKEN=your-token-here
AUTH_SECRET=paste-output-of-openssl-rand-base64-32
ADMIN_PASSWORD=choose-a-strong-password
```

Generate secret:

```bash
openssl rand -base64 32
```

### Add same vars on Netlify

Site settings → Environment variables → add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

Then deploy — see [DEPLOY-NETLIFY.md](./DEPLOY-NETLIFY.md).

---

## 4. Empty database (production)

```bash
npm run reset:turso          # uses TURSO_* from .env.local
npm run reset:turso:cli      # same via Turso CLI (./scripts/setup-turso.sh --wipe)
npm run reset:local          # optional: clear local SQLite file too
```

Fresh Turso instance (new URL if the old database was deleted):

```bash
./scripts/setup-turso.sh --fresh
```

Copy the printed `TURSO_DATABASE_URL` and create a token into `.env.local` and Netlify.

## 5. Demo data (optional, for testing)

```bash
npm run seed
```

Demo password for staff accounts: **demo123**.
