# Frontend — PT Clinic Portal

Patient-facing single-page app built with modern React. It handles sign-up, onboarding, scheduling, and session editing on top of the Express API that lives in `../backend`. Every screen is wired to the demo MySQL database that ships with this repo, but all records are fictional and live only on your machine unless you share them.

## Tools and how we use them
- **React 19 + TypeScript** — component authoring and type safety. Hooks + strict typing help us catch invalid UI states before they hit the API.
- **React Router v7** — client-side pages (`/`, `/onboarding`, `/patient`, `/admin`). Routing and `<Navigate>` gates enforce role-based flows (pending patients go through onboarding, admins land on their dashboard, etc.).
- **Context API (`AuthContext`)** — keeps the logged-in user object in memory so every component knows whether to show sign-in, onboarding, or the dashboard.
- **Vite 7** — dev server and build pipeline. Vite proxies API calls during `npm run dev` and outputs an optimized bundle for production-like runs.
- **Modern CSS modules** — each page/component owns a `.css` file that scopes styling without bringing in a heavyweight design system. Utility classes like `eyebrow` keep typography consistent.

## Feature map
1. **Home / Auth** — `components/Login` renders side-by-side log-in and sign-up forms. It calls `/auth/login` and `/auth/signup`, showing contextual success/error feedback.
2. **Onboarding** — `pages/Onboarding` collects a diagnosis code, referral date, and provider name, then sends them to `/patients/:id/onboarding` to unlock the full portal.
3. **Patient dashboard** — `pages/PatientHome` fetches therapists and upcoming sessions. It renders:
   - `ScheduleSession` to request a visit, validate time slots, and submit `/patients/:id/sessions`.
   - `UpcomingSessions` to show scheduled visits and open the inline editor.
   - `SessionEditor` overlay for rescheduling, updating status, pain scale, and notes via `PATCH /patients/:id/sessions/:sessionId`.
4. **Admin dashboard** — `pages/AdminHome` fetches `/admin/metrics` and renders no-show rates, outcome deltas, and top shoulder exercises. Each card opens a modal with deeper context (full outcome histories or the list of patients/therapists tied to that exercise order).

Because the backing data is seeded with fake names and appointments, you can safely explore flows without touching real PHI. Feel free to create as many dummy accounts as you need for demos.

## Running the UI
```bash
npm install
npm run dev
```
Create a `frontend/.env` file with `VITE_API_BASE_URL=http://localhost:4000` (or the URL where the backend runs). Vite will print the local URL to open in your browser.
Use the default admin credentials (`admin` / `AA**AA`) once the backend is running to preview the analytics dashboard.

## Building for production
```bash
npm run build
```
The command type-checks the project and outputs static assets into `dist/`. Serve that folder with any static file host that can proxy API requests to the backend.

## Troubleshooting
- **CORS errors?** Ensure the backend `.env` `CORS_ORIGIN` includes the frontend origin.
- **API 404s?** Check that the backend server is running and that `VITE_API_BASE_URL` matches its port.
- **Stale auth state?** The app only keeps auth info in memory; refreshes clear session data, so just sign back in.

Again, this is a prototype. Everything you see uses fake data, so be transparent when demoing it to stakeholders.
