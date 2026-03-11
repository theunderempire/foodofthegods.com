# Food of the Gods

Recipe manager and shopping list app. Monorepo containing the React frontend, Express API, and MongoDB seed data.

## Structure

```
foodofthegods.com/
├── web/                  # React + TypeScript + Vite frontend
├── api/                  # Express.js backend (Node 22)
├── db/                   # MongoDB seed data
├── docker-compose.yml    # Development
└── docker-compose.prod.yml
```

---

## Prerequisites

- Node 22 ([nvm](https://github.com/nvm-sh/nvm) recommended)
- Docker + Docker Compose

---

## Local Development

### Option A — Docker (API + DB only, frontend runs locally)

```bash
docker compose up
```

This starts:

- `fotg-api` on port 3000 (live-reloads from `./api`)
- `fotg-db` (MongoDB) on port 27017

To seed the database on first run:

```bash
docker compose --profile seed up db-seed
```

Then run the frontend locally:

```bash
cd web
cp .env.example .env.development   # set VITE_API_BASE_URL=http://localhost:3000
npm install
npm run dev
```

### Option B — Fully local (no Docker)

Start MongoDB separately, then:

```bash
# API
cd api
cp .env.example .env.development   # fill in values
npm install
npm run start-dev

# Frontend (separate terminal)
cd web
cp .env.example .env.development
npm install
npm run dev
```

---

## Web (`web/`)

| Command              | Description                      |
| -------------------- | -------------------------------- |
| `npm run dev`        | Start Vite dev server            |
| `npm run build`      | Type-check + production build    |
| `npm run preview`    | Preview production build locally |
| `npm test`           | Run unit tests (Vitest)          |
| `npm run test:watch` | Unit tests in watch mode         |
| `npm run test:e2e`   | Playwright end-to-end tests      |

**Environment variables** — copy `.env.example` to `.env.development`:

```
VITE_API_BASE_URL=http://localhost:3000
```

Production builds are output to `web/dist/` with base path `/foodofthegods/`.

---

## API (`api/`)

| Command             | Description                         |
| ------------------- | ----------------------------------- |
| `npm run start-dev` | Start with nodemon (dev, HTTP)      |
| `npm start`         | Start for production (HTTPS)        |
| `npm test`          | Run tests (Node native test runner) |
| `npm run lint`      | ESLint                              |
| `npm run format`    | Prettier                            |

**Environment variables** — copy `.env.example` to `.env.development` / `.env.production`:

```
DB_NAME=   # MongoDB DB name
DB_HOST_NAME=      # MongoDB host (use "fotg-db" in Docker, "localhost" locally)
JWT_SECRET=        # Secret for signing JWTs
GEMINI_API_KEY=    # Google Gemini API key (recipe import)
REGISTRATION_EMAIL= # Email address for registration notifications
```

In production the server runs HTTPS and reads Let's Encrypt certs from:

```
/etc/letsencrypt/live/theunderempire.com/
```

---

## Database (`db/`)

MongoDB 3.6. Data is persisted to `db/mongodb/database/` in dev (bind mount) or a named Docker volume in production.

Seed files are in `db/mongodb/seed/` and import three collections into the database specified by `DB_NAME`:

- `recipelist`
- `ingredientlist`
- `users`

> **Note:** The seed container runs with `--drop`, so it replaces existing data. Only run it intentionally.

---

## Production Deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Production overrides:

- API runs in HTTPS mode (`START_CMD=start`)
- SSL certs mounted from host `/etc/letsencrypt`
- MongoDB uses a persistent named volume (`mongodata`)
- `db-seed` is gated behind the `seed` profile

To seed on first deploy:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile seed up db-seed
```

To deploy the frontend, run the `web/autobuild` script on the server. It builds the app and deploys to `/var/www/html/theunderempire.com/public_html/foodofthegods/`.
