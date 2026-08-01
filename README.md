# Food of the Gods

Recipe manager and shopping list app. Monorepo containing the React frontend, Express API, and MongoDB seed data.

## Structure

```
foodofthegods.com/
├── web/                  # React + TypeScript + Vite frontend
├── api/                  # Express.js backend (Node 24)
├── db/                   # MongoDB seed data and backup script
├── docker-compose.yml    # Development
└── docker-compose.prod.yml
```

---

## Prerequisites

- Node 24 — the version in `api/.nvmrc` and `web/.nvmrc`, and what CI runs
  ([nvm](https://github.com/nvm-sh/nvm) recommended)
- Docker + Docker Compose
- npm. Do not use pnpm or yarn: the root `postinstall` shells out to
  `npm install`, and only `package-lock.json` files are committed.

---

## Local Development

### 1. Configure environment

```bash
cp .env.example .env   # fill in values (see Environment Variables below)
```

### 2. Start API + DB

```bash
npm install            # installs dependencies for api/ and web/
docker compose up
```

This starts:

- `fotg-api` on port 3000 (live-reloads from `./api`)
- `fotg-db` (MongoDB, internal only)

To seed the database on first run:

```bash
docker compose --profile seed up db-seed
```

### 3. Start the frontend

```bash
cd web && npm start
```

> The API refuses to start unless `JWT_SECRET` is at least 32 characters. If it
> exits immediately, read the error — it tells you how to generate one.

---

## Web (`web/`)

| Command               | Description                      |
| --------------------- | -------------------------------- |
| `npm start`           | Start Vite dev server            |
| `npm run build`       | Type-check + production build    |
| `npm run typecheck`   | `tsc --noEmit` only              |
| `npm run preview`     | Preview production build locally |
| `npm test`            | Run unit tests (Vitest)          |
| `npm run test:watch`  | Unit tests in watch mode         |
| `npm run test:e2e`    | Run e2e tests (Playwright)       |
| `npm run test:e2e:ui` | Playwright in UI mode            |

`npm run test:e2e` needs the API and database running (`docker compose up`).

`VITE_API_BASE_URL` is read from the root `.env` file (no web-specific env file needed).

Production builds output to `web/dist/` with base path `/foodofthegods/`.

---

## API (`api/`)

| Command                       | Description                                  |
| ----------------------------- | -------------------------------------------- |
| `npm run start-dev`           | Start with nodemon (live reload)             |
| `npm start`                   | Start for production                         |
| `npm test`                    | Run tests (Node native test runner)          |
| `npm run lint`                | ESLint                                       |
| `npm run format`              | Prettier                                     |
| `npm run swagger`             | Regenerate `swagger_output.json` from JSDoc  |
| `npm run backfill-thumbnails` | One-off: generate thumbnails for old recipes |

Tests need no database or network — collections are mocked and outbound calls are
stubbed. Two endpoints are useful when running locally:

- `GET /health` — reports API and database status
- `GET /docs` — Swagger UI, served from the committed `swagger_output.json`
  (regenerate with `npm run swagger` after changing routes)

---

## Environment Variables

All environment variables live in a single `.env` file at the repo root. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

| Variable                   | Description                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_USERNAME`              | MongoDB root username                                                                                                                                                                |
| `DB_PASSWORD`              | MongoDB root password                                                                                                                                                                |
| `DB_NAME`                  | MongoDB database name                                                                                                                                                                |
| `DB_HOST_NAME`             | MongoDB host (`fotg-db` in Docker, `localhost` otherwise)                                                                                                                            |
| `JWT_SECRET`               | Secret for signing JWTs. **Minimum 32 characters — the API refuses to start below that.** Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`   |
| `TRUST_PROXY_HOPS`         | Number of reverse proxies in front of the API. **Must be `1` in production** (behind Caddy) or rate limits key on the proxy's IP and every user shares one bucket. `0` for local dev |
| `APP_URL`                  | Frontend base URL, used in registration emails (no trailing slash)                                                                                                                   |
| `VITE_API_BASE_URL`        | API base URL, used in registration emails and thumbnail generation (no trailing slash)                                                                                               |
| `SMTP_HOST`                | SMTP server hostname (e.g. `smtp.gmail.com`)                                                                                                                                         |
| `SMTP_PORT`                | SMTP port (`587` for TLS, `465` for SSL)                                                                                                                                             |
| `SMTP_USER`                | SMTP username / email address (also receives registration emails)                                                                                                                    |
| `SMTP_PASS`                | SMTP password or app password                                                                                                                                                        |
| `SMTP_REJECT_UNAUTHORIZED` | Set to `false` to allow self-signed certs (default `true`)                                                                                                                           |

There is no server-wide Gemini API key. Each user supplies their own on the
Settings page, stored on their user record; AI import and list grouping are
disabled until they do. `GET /users/settings` reports only whether a key is set,
never the key itself.

---

## Tests and CI

| Where          | Runs                                                  |
| -------------- | ----------------------------------------------------- |
| pre-commit     | Prettier on staged files, then web and API unit tests |
| pre-push       | API lint, web typecheck, then Playwright e2e          |
| GitHub Actions | Both of the above, plus web build and `npm audit`     |

Git hooks are Husky-managed and client-side, so they can be skipped with
`--no-verify`; `.github/workflows/ci.yml` is the gate that actually blocks a merge.
It runs two jobs:

- **api** — lint, Prettier check, tests, and `npm audit --omit=dev --audit-level=high`
- **web** — typecheck, Prettier check, tests, and production build

Note that pre-push runs e2e, which needs `docker compose up` first. Pushing with
the stack down will fail there.

---

## Database (`db/`)

MongoDB 8. Data is persisted to a named Docker volume (`mongodata`) in both dev and production.

Seed files are in `db/mongodb/seed/` and import three collections into the database specified by `DB_NAME`:

- `recipelist`
- `ingredientlist`
- `users`

> **Note:** The seed container runs with `--drop`, so it replaces existing data. Only run it intentionally.

Backups run via cron using `db/backup.sh`. The script dumps the database and rotates old backups automatically.

---

## Registration Flow

Registration requires admin approval. No password is collected upfront.

1. User submits username + email on the `/register` page
2. Admin receives an approval email with a one-click approval link
3. On approval, the user receives an email with a one-time link to set their password (valid 24 hours)
4. User sets their password and can sign in immediately

Pending registrations are stored in the `pendingUsers` collection. Approval tokens expire after 7 days; set-password tokens expire after 24 hours.

---

## Production Deployment

Run from the repo root on the server. This is the normal path — it deploys the API
and the frontend in one step:

```bash
npm run deploy
```

Equivalent to `npm run --prefix api deploy && (cd web && ./autobuild)`, so either
half can be run on its own when only one side changed:

| Command                      | Effect                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| `npm run deploy` (root)      | API + frontend                                                              |
| `npm run deploy` (in `api/`) | Rebuilds and restarts the API container via the production Compose override |
| `./autobuild` (in `web/`)    | Installs, builds, and copies to `$HOME/docker/caddy/site/foodofthegods`     |
| `npm run build:all` (root)   | Rebuilds **every** container with the production override                   |

Before the first deploy after upgrading, check `.env` on the server: `JWT_SECRET`
must be at least 32 characters or the API will not boot, and `TRUST_PROXY_HOPS`
must be `1` behind Caddy.

### First deploy (database seed)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile seed up db-seed
```

> **Note:** The seed container runs with `--drop`. Only run this on first deploy or when intentionally resetting data.
