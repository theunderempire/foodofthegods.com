# Food of the Gods

Recipe manager and shopping list app. Monorepo containing the React frontend, Express API, and MongoDB seed data.

## Structure

```
foodofthegods.com/
├── web/                  # React + TypeScript + Vite frontend
├── api/                  # Express.js backend (Node 22)
├── db/                   # MongoDB seed data and backup script
├── docker-compose.yml    # Development
└── docker-compose.prod.yml
```

---

## Prerequisites

- Node 22 ([nvm](https://github.com/nvm-sh/nvm) recommended)
- Docker + Docker Compose

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
cd web
cp .env.example .env.development   # set VITE_API_BASE_URL=http://localhost:3000
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

**Environment variables** — copy `web/.env.example` to `web/.env.development`:

```
VITE_API_BASE_URL=http://localhost:3000
```

Production builds output to `web/dist/` with base path `/foodofthegods/`.

---

## API (`api/`)

| Command             | Description                         |
| ------------------- | ----------------------------------- |
| `npm run start-dev` | Start with nodemon (live reload)    |
| `npm start`         | Start for production                |
| `npm test`          | Run tests (Node native test runner) |
| `npm run lint`      | ESLint                              |
| `npm run format`    | Prettier                            |

---

## Environment Variables

All environment variables live in a single `.env` file at the repo root. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

| Variable                  | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `DB_USERNAME`             | MongoDB root username                                             |
| `DB_PASSWORD`             | MongoDB root password                                             |
| `DB_NAME`                 | MongoDB database name                                             |
| `DB_HOST_NAME`            | MongoDB host (`fotg-db` in Docker, `localhost` otherwise)         |
| `JWT_SECRET`              | Secret for signing JWTs                                           |
| `GEMINI_API_KEY`          | Google Gemini API key (used for recipe import)                    |
| `REGISTRATION_EMAIL`      | Email address that receives registration approval requests        |
| `APP_URL`                 | Frontend base URL, used in registration emails (no trailing slash)|
| `API_URL`                 | API base URL, used in registration emails (no trailing slash)     |
| `SMTP_HOST`               | SMTP server hostname (e.g. `smtp.gmail.com`)                      |
| `SMTP_PORT`               | SMTP port (`587` for TLS, `465` for SSL)                          |
| `SMTP_USER`               | SMTP username / email address                                     |
| `SMTP_PASS`               | SMTP password or app password                                     |
| `SMTP_REJECT_UNAUTHORIZED`| Set to `false` to allow self-signed certs (default `true`)        |

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

### API

```bash
cd api
npm run deploy
```

Rebuilds and restarts the API container using the production Docker Compose override.

### Frontend

Run on the server from the `web/` directory:

```bash
./autobuild
```

Installs dependencies, builds the app, and deploys to `/var/www/html/theunderempire.com/public_html/foodofthegods/`.

### First deploy (database seed)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile seed up db-seed
```

> **Note:** The seed container runs with `--drop`. Only run this on first deploy or when intentionally resetting data.
