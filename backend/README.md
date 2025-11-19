# Backend — PT Clinic API

Express + TypeScript service that powers the demo patient portal. It exposes authentication, onboarding, scheduling, and session editing endpoints backed by a MySQL schema defined in `../sql`. **All patients, therapists, referrals, and sessions are sample records meant for testing and walkthroughs—they are not real medical records.**

## Tools and how they are used
- **Express 5** — routing, JSON parsing, and error handling for all API endpoints (`/auth/*`, `/patients/*`, `/therapists/*`).
- **TypeScript + ts-node** — type-checked source (`src/`) executed directly in dev via `npm run dev`. Builds emit CommonJS output to `dist/`.
- **mysql2/promise** — connection pool with named placeholders. `src/db.ts` centralizes pool creation plus helper functions that auto-create missing columns/constraints on startup.
- **bcrypt-style password helpers** (`src/auth.ts`) — passwords are salted/hashed before storage, supporting the login and signup flows.
- **cors** — opts into per-origin protection so the React app can call the API during local development.
- **dotenv** — loads `.env` to configure DB host/user/password, port, and allowed CORS origins.
- **Knex CLI** — available via `npm run migrate:*` for future schema migrations (current schema is delivered via Docker SQL scripts).

## Data flow highlights
1. **Signup / Login** — `/auth/signup` creates a patient + pending user; `/auth/login` verifies credentials and returns role info so the UI can decide which route to show.
2. **Onboarding** — `/patients/:patientId/onboarding` upserts referral data and promotes the user to the `patient` role.
3. **Therapists** — `/therapists` and `/therapists/:therapistId/availability` expose staff plus available hourly slots (08:00–16:00).
4. **Scheduling** — `/patients/:patientId/sessions` (GET/POST) and `/patients/:patientId/sessions/:sessionId` (PATCH) enforce business rules like “one patient session per day” and “no overlapping therapist slots.”
5. **Health** — `/health` pings the DB and reports readiness so Docker/ops checks can verify uptime.
6. **Admin metrics** — `/admin/metrics` aggregates no-show rate by therapist/month, outcome score deltas, and top shoulder exercise prescriptions plus the detailed records the dashboard modals display.

Because everything runs on top of seeded demo data, be explicit with stakeholders that the portal is illustrative only. Never point it at real PHI without the proper compliance review.

## Environment configuration
Create `backend/.env` with values like:

```dotenv
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=appsecret
DB_NAME=PT_Clinic
CORS_ORIGIN=http://localhost:5173
```

`CORS_ORIGIN` accepts a comma-separated list when you need to allow multiple frontends. The default admin login can be overridden with `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (defaults: `admin` / `AA**AA`).

## Available scripts
- `npm run dev` — Watches `src/` and runs `ts-node` via `nodemon`.
- `npm run build` — Compiles TypeScript into `dist/`.
- `npm start` — Runs the compiled JavaScript (after `npm run build`).
- `npm run migrate:make -- <name>` — Creates a new Knex migration file.
- `npm run migrate:latest` / `npm run migrate:rollback` — Applies or reverts migrations against the database specified in `.env`.

## Database + seed data
The repo includes:
- `sql/00_app_user.sql` — ensures the `appuser/appsecret` MySQL account exists.
- `sql/create_tables.sql` — creates all tables and inserts the fictional patients, staff, therapists, referrals, outcome measures, and sessions used by the app.
- `backend/sql/admin_seed.sql` — adds deeper shoulder exercise data, multi-month sessions, and outcome histories so the admin dashboard always has something to chart.
- `Dockerfile.db` + `docker-compose.yml` — build a MySQL container that automatically runs the SQL scripts above the first time it starts.

If you need to reset everything, stop the containers, run `docker compose down -v`, and start them again with `docker compose up -d`. The backend also seeds/updates the admin account and analytics dataset every time it boots, so developers using an existing database still get the same demo experience.
