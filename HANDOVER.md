# Emtees LMS — Web + Backend Handover

This document is for a developer taking over the **Emtees Academy LMS**: the web portal and the backend API
that also serves the Flutter mobile app (repo: `emtees_app`). It explains what exists, how to run it on a
Windows machine, how it is deployed, and what is still open.

> **No secrets are written in this file.** Passwords, keys and the `.env` are delivered separately in the
> private bundle (`handover-private.zip`). See [Private files](#3-private-files-not-on-github).

---

## 1. What this system is

An online-teaching platform for Emtees Academy:

- **Web portal** (React) for admins, academic heads, teachers, students and sales executives.
- **Backend** (Node/Express + tRPC) with a PostgreSQL database.
- **Live classes** run on a **self-hosted Jitsi Meet** server (`meet.gecouncil.com`).
- **Mobile app** (separate repo `emtees_app`) for teachers and students; it talks to the same backend through a
  REST layer at `/api/mobile`.

Roles: `super_admin`, `admin`, `academic_head`, `teacher`, `student`, `sales_executive`.

## 2. Architecture

```
 Browser (React, Vite)  ──►  nginx (HTTPS, gecouncil.com)  ──►  Node/Express :3000 (pm2: emtees-api)
 Flutter app            ──►        /api/trpc   (web, tRPC + superjson)        │
                                    /api/mobile (app, REST/JSON)               ├─► PostgreSQL (AWS RDS)
                                    /api/webhooks/jitsi                        ├─► Socket.IO (realtime)
                                    /socket.io (realtime)                      └─► scheduler (runs every minute)
 Video calls ──► Jitsi Meet (meet.gecouncil.com) on the SAME EC2 server: prosody + jicofo + videobridge
```

Repo layout (this repo, an npm-workspaces monorepo):

| Path | What it is |
|---|---|
| `client/` | React + Vite + Tailwind + shadcn/ui web app. Pages in `client/src/lms-pages/`. |
| `server/` | Express + tRPC backend. Entry `server/src/index.ts`. |
| `server/src/routers/` | API routers (`classes`, `admin`, `students`, `mobile`, `webhooks`, `appRelease`, …). |
| `server/src/lib/` | Business logic: `classEngine.ts` (attendance/credits/salary), `scheduler.ts`, `jitsi.ts`, notifications. |
| `server/db/` | Drizzle schema (`schema.ts`), boot-time migrations (`apply-migrations.ts`), `seed.ts`. |
| `contracts/` | Shared types/validation used by client and server. |
| `docs/`, `PLAN.md` | Earlier design notes (mobile architecture, plans). |
| `deploy.sh` | Builds and deploys server + web to the EC2 server. |

## 3. Private files (not on GitHub)

The following are deliberately **not** in Git and come in `handover-private.zip`:

| File | Put it here | Purpose |
|---|---|---|
| `server/.env` | `<repo>/server/.env` | All backend secrets. Names are listed in [section 7](#7-environment-variables). |
| `server/global-bundle.pem` | `<repo>/server/global-bundle.pem` | Public AWS RDS certificate (production DB SSL). |
| `server-access/emtees.pem` | e.g. `C:\Users\<you>\.ssh\emtees.pem` | SSH key for the live server. Treat as a master key. |

The bundle also has `README-PRIVATE.txt` with the test logins. The `.env` in the bundle points to the
**production database** — read the next section before running anything.

## 4. Prerequisites (Windows)

- **Node.js 24** (developed on v24.19.0; recent LTS versions likely work, not verified) and **npm**.
- **Git**.
- **PostgreSQL 16+** for local development (see below). pgAdmin is handy.
- **Git Bash** (comes with Git for Windows) if you want to run `deploy.sh`; also needs `ssh`, `scp`, `tar`
  (Windows 10/11 include OpenSSH and `tar`).
- VS Code recommended.

## 5. Run locally

> Do **not** develop against the production database. The production DB only accepts connections from the
> EC2 server anyway, and a mistake there affects real students and salaries. Use a local PostgreSQL.

1. **Clone** the repo, then put `server/.env` and `server/global-bundle.pem` from the private bundle in place.
2. **Create a local database** (PowerShell, adjust the postgres password):
   ```powershell
   psql -U postgres -c "CREATE DATABASE emtees;"
   ```
3. **Edit `server/.env`** and replace only `DATABASE_URL` with your local one:
   ```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/emtees"
   ```
   (Because the URL contains `localhost`, the server turns SSL off automatically.) Leave the other values
   alone, or use dummy values for SMTP / Razorpay if you don't want real emails or payments in development —
   Razorpay falls back to mock keys if its variables are missing.
4. **Install** (from the repo root, installs both workspaces):
   ```powershell
   npm install
   ```
5. **Create the tables** from the schema, then add the first admin:
   ```powershell
   npm run db:push --workspace=server
   npm run db:seed --workspace=server
   ```
   The seed creates `admin` / `admin123` — **change this password** after logging in. If `db:push` complains,
   `npm run db:migrate --workspace=server` applies the SQL files in `server/db/migrations/` instead.
   The server also runs extra idempotent migrations (`server/db/apply-migrations.ts`) every time it starts.
   *(A from-scratch local setup has not been re-tested on Windows by the previous developer; if a step fails,
   the error is almost always a missing table/column — compare with `server/db/schema.ts`.)*
6. **Start both servers** (backend on :3000, web on :5173 with a proxy to the backend):
   ```powershell
   npm run dev
   ```
   Open http://localhost:5173.

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Backend + web together |
| `npm run dev --workspace=server` | Backend only |
| `npm run build` | Build web and server (`tsc` type-checks both) |
| `npm run test` | Vitest |

Video calls in local dev use the real Jitsi server `meet.gecouncil.com` (the JWT is signed with
`JITSI_APP_ID` / `JITSI_APP_SECRET`), so they work from your laptop too.

## 6. How the important features work

### Attendance, "valid class" and salary
1. A teacher starts a class (web or app). The backend sets it `ongoing` and notifies students
   (Socket.IO event + in-app notification). 1-to-1 students get an **incoming call** event
   (`1to1:incoming_call`); the mobile app shows a full-screen call prompt.
2. When someone actually enters or leaves the Jitsi room, **the web page and the mobile app call
   `class.reportPresence`** (REST: `POST /api/mobile/classes/:id/presence` and
   `/api/mobile/one-to-one/:id/presence`). This writes rows to `attendance_events`.
   *The Jitsi server itself does not send webhooks (the `/api/webhooks/jitsi` route exists but is not
   configured on the Jitsi side), which is why the clients report presence.*
3. 1-to-1 sessions also send a heartbeat every minute; it is kept as a per-person minute counter and used
   as a fallback when no join/leave rows exist. If the teacher stops sending heartbeats for 5 minutes the
   scheduler ends the session at the last heartbeat.
4. When the class ends, `server/src/lib/classEngine.ts → evaluateClassCompletion` adds up each person's
   minutes. A class is **valid** only if the teacher **and** the student each reached the minimum
   (**20 minutes**, stored in `system_settings.class_duration_threshold`; adjustable by an admin in
   Settings). Valid → attendance `present`, one **class credit** is deducted from the student's ledger
   (`class_ledger_transactions`) and the teacher's monthly salary is recalculated. Invalid → `absent`, no
   credit, no pay, and the student gets a "missed class" notification.
5. **Teacher disconnect:** if the teacher leaves, the class is *not* ended immediately. The scheduler waits
   5 minutes (`finalizeDisconnectedSessions`); if the teacher rejoins in time, the class continues and the gap
   is simply not counted.

### Salary
`recalculateSalaryInternal` (in `server/src/routers/admin.ts`) counts a teacher's valid classes per duration
bucket (30 / 45 / 60 min) and applies the rates from `teacher_salary_configs`. If a teacher has **no** config
row, it falls back to ₹75 / ₹100 / ₹125. Admins set rates in the web portal (Salaries → Teacher Rates).

### "Already taken" (legacy students)
Older students whose attendance was tracked on WhatsApp have `profiles.already_taken_sessions`. It reduces
their pending 1-to-1 classes (`server/src/lib/sessionHelper.ts`). The backend mutation exists
(`admin.setAlreadyTaken`); **there is no web form to enter it yet** (see [pending work](#12-known-issues-and-pending-work)).

### Reports
- **Web:** `Reports` page (Student, Teacher, Teacher Attendance, Class, Workload, Teacher Student-Wise, Daily).
  Admins see everything; academic heads are meant to see only their department's teachers.
- **Mobile:** teachers get *My Reports* (Today, Sessions, Date range, Salary); students get *My Class Report*.
  These are the REST endpoints at the bottom of `server/src/routers/mobile.ts` (`/reports/...`). Admin and
  academic-head reports are intentionally **web-only**.

### Scheduler
`server/src/lib/scheduler.ts` runs inside the API process every 60 s: class reminders, fee reminders and
restrictions, ending abandoned sessions, absence alerts, recording clean-up. If the API is down the scheduler is
down too.

### App releases (in-app update)
The server stores the latest Android APK and serves it at `GET /api/mobile/app-releases/latest` and
`/download/mobile`. Publishing is `POST /api/mobile/app-releases/publish` (multipart: `platform`, `versionName`,
`versionCode`, `releaseNotes`, `apk`). The APK file is stored under `server/storage/app-releases/` on the
server. See the app's own handover for the publish script.
**Open risk:** the publish endpoint is protected only if `RELEASE_PUBLISH_SECRET` is set in the server's
`.env` — it is currently **not set**, so anyone who finds the URL could publish a release. Set it.

## 7. Environment variables

All live in `server/.env` (values only in the private bundle):

| Variable | Purpose |
|---|---|
| `APP_ID`, `APP_SECRET` | App identity; `APP_SECRET` signs login tokens (JWT). Changing it logs everyone out. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `STUDENT_ID_PREFIX` | Prefix for generated student IDs. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Payments. |
| `JITSI_APP_ID`, `JITSI_APP_SECRET` | Must **exactly match** `app_id` / `app_secret` in the Jitsi (prosody) config on the server. No stray spaces. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing email. |
| `RECORDING_RETENTION_DAYS` | Days to keep class recordings. |
| `CRON_SECRET` *(optional)* | Protects `GET /api/cron/scheduler`. |
| `RELEASE_PUBLISH_SECRET` *(optional, should be set)* | Protects app-release publishing. |
| `PORT` *(optional)* | Defaults to 3000. |

## 8. Production environment

| Item | Value |
|---|---|
| Server | AWS EC2, Ubuntu, user `ubuntu`, IP **13.235.121.148** (changes if the instance is stopped/started — see Elastic IP below) |
| Domains | `gecouncil.com` (web + API) and `meet.gecouncil.com` (Jitsi) both point to that IP |
| API process | `pm2` process **`emtees-api`**, folder `/home/ubuntu/emtees-api/server` |
| Web files | `/var/www/emtees/client/dist` (served by nginx) |
| Database | AWS RDS PostgreSQL, reachable only from the EC2 server |
| Logs | `pm2 logs emtees-api`, `/var/log/jitsi/jicofo.log`, `/var/log/prosody/prosody.log` |

Everything (API, nginx, Jitsi) runs on the one EC2 machine. Memory and CPU are shared, so heavy video load can
slow the API too.

## 9. Deploying

From the repo root in **Git Bash** (or macOS/Linux terminal), with the SSH key at the path used inside
`deploy.sh` (edit the `-i` path if yours differs):

```bash
./deploy.sh
```

It builds server and client, uploads them, replaces the web files, runs `npm install` on the server and
restarts `emtees-api`. Important facts:

- `deploy.sh` does **not** upload `.env`. The server keeps its own `.env`; change it by SSH only.
- The server applies small database migrations itself on every start (`apply-migrations.ts`).
- Check after deploying: `ssh -i emtees.pem ubuntu@13.235.121.148 "pm2 logs emtees-api --lines 30 --nostream"`.
- `deploy.sh` is the only deploy script (the older `run_deploy*.sh` / `deploy-pack.sh` variants were removed).
- If the server's IP changed, update the IP inside the scripts and `DEPLOYMENT.md`.

## 10. Jitsi (video) server notes

Installed from the Jitsi Debian packages (not Docker). Services: `prosody`, `jicofo`, `jitsi-videobridge2`, `nginx`.

- **Auth:** JWT. The backend signs tokens with `JITSI_APP_SECRET` (`server/src/lib/jitsi.ts`). Teachers get
  moderator rights.
- **Videobridge public IP:** `/etc/jitsi/videobridge/jvb.conf` contains
  `ice4j.harvest.mapping.statichost { local-address = "<private IP>"  public-address = "<public IP>" }`.
  **If the EC2 public IP changes, update `public-address` and restart** (`sudo systemctl restart jitsi-videobridge2`
  then `sudo systemctl restart jicofo`). When it is wrong, Jicofo logs
  `No valid IP addresses available for harvesting` / `no operational bridges` and the app shows
  *"Unfortunately an error occurred, retrying…"*.
- **Firewall (AWS security group):** TCP 22 (your IP only), TCP 80/443, **UDP 10000** (video media).
- **Elastic IP:** the instance should have an Elastic IP so the address never changes. Not done yet.

## 11. Operations cheat sheet

```bash
ssh -i emtees.pem ubuntu@13.235.121.148
pm2 list                                    # is emtees-api online?
pm2 logs emtees-api --lines 50 --nostream   # recent logs
pm2 restart emtees-api --update-env         # restart (re-read .env)
sudo systemctl status prosody jicofo jitsi-videobridge2 --no-pager
sudo tail -n 40 /var/log/jitsi/jicofo.log
```

## 12. Known issues and pending work

1. **Verify the attendance flow end to end.** Run a real ~25-minute 1-to-1 session between a teacher and a
   student on app 1.0.14 and check: Reports → Sessions (app), student report, Salaries (web). Presence
   reporting was added last and has not been confirmed with a real call.
2. **Video lag.** Calls connect but were reported as laggy. Checks still to do on the server: is UDP 10000 open
   in the security group (`sudo timeout 15 tcpdump -ni ens5 udp port 10000 -c 20` during a call shows packets
   if it is), CPU/memory under load (`top`, `free -m`), and the EC2 instance type (burstable `t*` types slow
   down when CPU credits run out).
3. **"Already taken" web form** for legacy students (backend field exists).
4. **Set `RELEASE_PUBLISH_SECRET`** on the server.
5. **Elastic IP** for the server.
6. **Group classes:** there is no per-minute fallback like 1-to-1 has; a student whose phone crashes without
   reporting "left" is counted as present until the teacher leaves.
7. **Old data:** past classes have no join/leave rows, so their reports show no times.
8. **Academic head scoping** (only their department's teachers on every report tab) is implemented in many
   endpoints but was not re-verified across all tabs.
9. **Cleanup:** `server/db/manual_session_backfill.ts` is a one-off script used to hand-enter one session;
   delete it from the repo and the server. Old build archives (`*.tar.gz`) were removed from Git.
10. Incoming-call prompts only show while the student's app is open. Ringing a closed app needs push
    notifications (Firebase) — not built.

## 13. Security checklist for the new owner

- Rotate: database password, `APP_SECRET`, SMTP password, Razorpay secret, Jitsi secret, and the SSH key
  after the handover. Never commit `.env`, `*.pem` or keystores (`.gitignore` already blocks them).
- Delete the test accounts (`test_teacher`, `test_student`) from the production database when finished.
- Change the seeded `admin` password.
