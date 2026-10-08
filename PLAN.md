# Emtees — Operational Runbook & Mobile App Plan

Reference doc for this repo's install/update/deploy mechanics and the companion-app roadmap. Read this instead of re-deriving repo structure each session — update it when the facts below change.

See also: [docs/APP_ARCHITECTURE.md](docs/APP_ARCHITECTURE.md) for the full mobile app architecture + feature spec.

## 1. Repo shape (facts, not narration)

- Monorepo, npm workspaces: `client` (React 19 + Vite SPA), `server` (Express + tRPC + Drizzle/Postgres), `contracts` (shared Zod validation/types, NOT a workspace — imported by path).
- Node version: **v24** (server `@types/node ^24.10.1`; EC2 confirmed running v24.19.0 via NVM). Client's `@types/node ^26.2.0` is just a types-package mismatch, not a runtime requirement — don't chase it.
- Live video: self-hosted Jitsi at `meet.gecouncil.com` (not meet.jit.si). Realtime: socket.io. Payments: Razorpay (student-facing). Email: nodemailer/SMTP (no-ops silently if `SMTP_HOST` unset). SMS/WhatsApp: stubbed, not wired to a real provider.
- Production infra: single EC2 instance (`13.235.19.185`), PM2 process named `emtees-api`, Nginx reverse-proxying to `localhost:3000`, static client served by Nginx directly from a dist folder (not through Node).
- DB migrations: Drizzle Kit, versioned SQL files in `server/db/migrations/` (`0000_init.sql` ... `0009_first_stardust.sql` as of 2026-09-24). Production requires SSL via `server/global-bundle.pem` (AWS RDS CA cert) when `NODE_ENV=production` — this file must always be present in `server/` on EC2, it is not committed to git (check `.gitignore`) and must be part of every deploy package.
- `emtees.pem` (SSH key to the EC2 box) currently sits **untracked** at the repo root (`git status` shows it untracked) — do not `git add` it. Treat it as a secret; if it should live elsewhere, move it out of the repo rather than leaving it here relying on gitignore.

## 2. Local development

```bash
npm install                 # root, installs both workspaces
npm run dev                 # runs server (tsx, port 3000) + client (vite, port 5173) concurrently
```
Client dev server proxies `/api` and `/socket.io` to `localhost:3000` (see `client/vite.config.ts`) — no CORS config needed locally.

Other root scripts:
```bash
npm run build                # builds client then server
npm run lint                 # lints both workspaces
npm run format                # prettier --write .
npm test                      # vitest run
```

Server-only scripts (`cd server` or `--workspace=server`):
```bash
npm run dev                  # tsx src/index.ts
npm run build                 # tsc -> server/dist/
npm start                     # node dist/src/index.js  (run AFTER build — this is the correct prod start command)
```

## 3. Database migrations

Schema source of truth: `server/db/schema.ts`. Workflow:

```bash
# after editing schema.ts:
cd server
npx drizzle-kit generate      # generates the next 000X_<slug>.sql migration file (not a package.json script — run directly)
npm run db:migrate            # applies pending migrations (drizzle-kit migrate) — SAFE for prod
npm run db:push               # dev-only shortcut, schema-diff push, skips versioned files — do NOT use in prod
npm run db:seed               # tsx db/seed.ts — dev/staging only
```

`server/db/apply-migrations.ts` exists as a possible alternate custom runner — verify what it does before relying on it; the canonical path is `drizzle-kit migrate` via `npm run db:migrate`.

## 4. Deploying / updating the live server — canonical procedure

There are **four overlapping scripts** in the repo root (`deploy-pack.sh`, `deploy.sh`, `run_deploy.sh`, `run_deploy_client.sh`) with inconsistent targets (different remote paths, different start commands — one even runs `pm2 start npm -- run dev` against raw TS instead of the built `dist/`). **Use the documented flow below as canonical.** Treat the other three scripts as legacy/unverified until someone reconciles them — don't mix and match.

### 4.1 Canonical backend update (per `DEPLOYMENT.md`)

```bash
# 1. Package (from repo root) — bundles server/ + contracts/
./deploy-pack.sh
# produces emtees-deploy-new.tar.gz

# 2. Ship it
scp -i ~/Downloads/emtees.pem emtees-deploy-new.tar.gz ubuntu@13.235.19.185:~

# 3. SSH in
ssh -i ~/Downloads/emtees.pem ubuntu@13.235.19.185

# 4. On the EC2 box:
tar -xzf emtees-deploy-new.tar.gz -C ~/emtees-api
cd ~/emtees-api/server
npm install          # dev deps required for TS build + workspace linking
npm run build         # tsc -> dist/

# 5. Restart the process
pm2 restart emtees-api
pm2 save              # only if env vars or startup script changed
```

Verify `server/global-bundle.pem` exists in `~/emtees-api/server/` after extraction — production DB SSL depends on it.

### 4.2 Client (frontend) update

Not documented in `DEPLOYMENT.md` — inferred from `deploy.sh`: build `client/`, ship `client/dist/` to the Nginx-served static path. **Before running this, confirm the actual Nginx `root` directive on the EC2 box** — `deploy.sh` targets `/var/www/emtees/client/dist` while `run_deploy_client.sh` targets `/home/ubuntu/frontend-dist/`; only one of these is real. Resolve this discrepancy once (check Nginx config on the server) and update this section with the confirmed path.

```bash
cd client && npm run build        # -> client/dist/
# scp client/dist/* to the CONFIRMED nginx root, then no restart needed (static files)
```

### 4.3 Versioning convention

No formal semver/git-tag process currently exists in this repo (root `package.json` version is `0.0.0`). Recommended lightweight convention going forward, to keep deploys traceable without extra tooling:
- Tag each production deploy: `git tag deploy-YYYY-MM-DD-HHmm && git push --tags` (only if/when a remote is configured for pushing).
- Note the migration number deployed alongside the tag (e.g. "deploy-2026-09-24, migrations through 0009").
- Before deploying, confirm no `db:migrate` is pending against the target DB — run `npm run db:migrate` as the LAST step before `pm2 restart`, not after, so the running code and schema are never mismatched mid-restart.

## 5. Reducing token usage across sessions

To avoid re-deriving repo facts via the LLM each time:
- This file (`PLAN.md`) and [docs/APP_ARCHITECTURE.md](docs/APP_ARCHITECTURE.md) are the canonical reference — update them in place when facts change (new migration, resolved deploy-script discrepancy, new mobile milestone) rather than re-analyzing the repo from scratch next session.
- Point a future Claude session at this file directly (`Read PLAN.md`) instead of asking it to "analyze the repo" again.
- When only one fact is stale (e.g. migration number, Nginx path), edit just that line rather than regenerating the whole doc.

## 6. Mobile app — phased plan

Full architecture/feature detail: [docs/APP_ARCHITECTURE.md](docs/APP_ARCHITECTURE.md). Phase summary:

1. **Phase 0 — backend push foundation**: `device_tokens` table + migration, `user.registerDeviceToken`/`unregisterDeviceToken` procedures, `push` channel in `NotificationService.dispatch`, wire into `1to1:incoming_call` and `class:started` emit sites. No mobile code yet — this can be built and deployed independently, verified with a test script hitting the Expo Push API.
2. **Phase 1 — RN app shell**: Expo (dev-client) project, auth (`auth.login`, secure token storage), tRPC + socket.io client wiring against `contracts/`, notification inbox, profile, chat (batch + private).
3. **Phase 2 — live sessions (the core feature)**: native Jitsi integration, CallKit/ConnectionService incoming-call UI wired to VoIP/high-priority push from Phase 0, join/lobby flow, heartbeat + attendance recording calls.
4. **Phase 3 — role-specific workflows**: student (materials, assignments, fees/Razorpay, community), teacher (start/end class, salary view), admin (approvals, alerts dashboard), sales (demo calls, leaderboard, quick closure entry).
5. **Phase 4 — app store readiness**: iOS/Android build pipelines, push certs (APNs key, FCM project), store listings, crash reporting.

Pre-req fixes flagged in the architecture doc worth doing before/alongside Phase 0: add expiry to the login JWT, confirm `APP_SECRET` is always set in production, resolve the deploy-script inconsistencies in §4 above (a mobile release train needs a trustworthy, single-path backend deploy process).
