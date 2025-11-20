# PT Clinic Portal

Prototype patient portal for a physical-therapy clinic. It pairs a Vite/React frontend with a TypeScript/Express API and a MySQL database that is preloaded with fictional people, sessions, and referrals. **No real medical records live in this repo or in the default database dump.**

## What's inside
- `frontend/` — Vite-powered React app for patient sign-up, onboarding, scheduling, and session editing.
- `backend/` — Express API that handles authentication, referral capture, scheduling rules, and MySQL access.
- `sql/` + `Dockerfile.db` — Database schema plus demo seed data that Docker Compose applies on first boot.

See the dedicated READMEs in `frontend/` and `backend/` for deeper dives into the tooling and architecture choices.

## Quick start for non-technical teammates
These steps assume you're on macOS, Windows, or a mainstream Linux desktop. Everything happens in a terminal, but you can copy/paste the commands exactly as written.

### 1. Install the two prerequisites
1. **Docker Desktop** — download from [docker.com](https://www.docker.com/products/docker-desktop/) and follow the installer wizard. The default settings are fine; we just use Docker to run MySQL with the sample data.
2. **Node.js 20 LTS** — download from [nodejs.org](https://nodejs.org/en/download). This also installs `npm`, the package manager we call in the commands below.

### 2. Start the demo database
Open a terminal window inside this project folder and run:

```bash
docker compose up -d
```

The first run downloads the MySQL image, creates the `PT_Clinic` database, and loads all of the fictional seed data. Docker keeps running in the background; you only have to redo this step if you shut Docker down completely.

### 3. Configure the apps
Create two small text files so the frontend and backend know how to reach each other. The defaults below match what Docker creates, so you can copy/paste them verbatim.

`backend/.env`
```dotenv
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=appsecret
DB_NAME=PT_Clinic
CORS_ORIGIN=http://localhost:5173
```

`frontend/.env`
```dotenv
VITE_API_BASE_URL=http://localhost:4000
```

### 4. Install the JavaScript dependencies (one time)
```bash
npm install --prefix backend
npm install --prefix frontend
```

### 5. Run the backend API
```bash
npm run dev --prefix backend
```

Leave that terminal window open so the server keeps running. When you see “Server listening on port 4000” you are good to go.

### 6. Run the frontend
Open a second terminal window (or tab) and run:
```bash
npm run dev --prefix frontend
```

Vite prints a local URL (usually `http://localhost:5173`). Open it in your browser to see the portal.

### 7. Explore the portal
- **Transparent data notice:** all patient profiles, therapists, referrals, and sessions are sample records generated for design and engineering testing. Feel free to sign up as yourself—the data never leaves your machine unless you explicitly share it.
- Create an account via “New to the clinic?” on the home page. After submitting, sign in with the username/password you just chose.
- Complete onboarding (diagnosis code, referral details). Once finished you will land on the patient dashboard where you can schedule new sessions, review/upate upcoming visits, and experiment with time-slot validation.
- Review operational analytics by signing in as the pre-seeded admin: **username `admin` / password `AA**AA`**. The Admin tab unlocks no-show rates, outcome deltas, and shoulder exercise orders with click-through detail modals.

If something goes wrong, stop the running commands with `Ctrl+C`, fix any typos, and re-run the steps. You can wipe and rebuild the database at any time with `docker compose down -v` followed by `docker compose up -d`. To refresh the fictional analytics data without rebuilding everything, run `mysql -uappuser -pappsecret PT_Clinic < sql/02_seed_data.sql`.

## Need more detail?
- `frontend/README.md` describes the UI stack, routing, and how the views talk to the API.
- `backend/README.md` covers the Express server, database helpers, and available endpoints.
- `sql/` shows exactly how the schema is created and how the fake data gets loaded.

Everything here is for demonstration and training purposes; please do not load real PHI until the project has been reviewed for compliance.
