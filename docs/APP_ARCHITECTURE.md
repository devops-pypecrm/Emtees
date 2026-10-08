# Emtees Companion App — Architecture & Feature Spec

Status: proposal / working spec. Derived from analysis of the existing `emtees-academy-monorepo` web platform (client/ + server/ + contracts/) as of 2026-09-24. No mobile code exists in the repo today — this is a from-scratch build.

## 1. Why a companion app, and what it must nail

The web client (`client/`, React 19 + Vite SPA) already covers the full academy + sales CRM. The one thing it structurally cannot do is **ring the user when they're not looking at the browser tab**. Today's "incoming call" UX (`client/src/components/IncomingCallOverlay.tsx`) only works because a `socket.io` connection is open in a foregrounded tab. A phone app's entire reason to exist is to fix that: **wake the device and show a real incoming-call screen even when the app is backgrounded or killed**, then let the student/teacher do everything else (attendance, chat, fees, notifications, sales workflows) without needing a laptop.

Two non-negotiable technical facts drive every decision below:

- There is **no push-notification infrastructure anywhere in the repo** (confirmed: no FCM/APNs, no device-token table, no `capacitor`/`react-native`/`expo` packages, no service worker). It has to be built from scratch, both server-side (new table + dispatch channel) and client-side.
- Every session-gating rule (the 20-minute attendance threshold, class-credit debits, lobby approval, role permissions) lives **server-side** in `server/src/lib/classEngine.ts`, `sessionHelper.ts`, and per-procedure middleware guards. The app is a new client against the existing tRPC API — it must not reimplement business logic, only call the same procedures the web client calls.

## 2. Recommended approach: React Native (not Capacitor, not a full native rewrite)

| Option | Verdict |
|---|---|
| **React Native (Expo)** | **Recommended.** Reuses `@trpc/client`, `socket.io-client`, `zod` contracts, and most business logic/hooks (`useAuth`, permission logic) near-verbatim from `client/src`. Native modules (`expo-notifications`, `react-native-callkeep`, `@jitsi/react-native-sdk` or a WebView fallback) exist for exactly the hard parts: push wake, CallKit/ConnectionService full-screen incoming-call UI, and native Jitsi. |
| Capacitor (wrap the existing Vite SPA) | Fastest to ship, but Jitsi-in-WebView cannot show a system-level incoming-call screen while backgrounded/killed — defeats the primary goal. Consider only as a stopgap for a "read-only companion" (notifications, chat, dashboards) before the real app ships. |
| Fully separate native (Swift/Kotlin) | Best call UX ceiling, but duplicates all business logic in two more languages with no code-sharing against `contracts/`. Not worth it unless the team has native engineers to spare. |

This doc assumes **React Native + Expo (bare/dev-client, not Expo Go, since native call modules require custom native code)**.

## 3. High-level architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│   Emtees Mobile App (RN)     │        │   Emtees Web Client (existing)│
│  - Expo + React Navigation   │        │  - React 19 + Vite (unchanged)│
│  - @trpc/client (same API)   │        │                                │
│  - socket.io-client          │        └──────────────┬─────────────────┘
│  - expo-notifications (FCM/  │                       │
│    APNs) + react-native-     │                       │
│    callkeep (CallKit/        │                       │
│    ConnectionService)        │                       │
│  - @jitsi/react-native-sdk   │                       │
│    (native video call)       │                       │
└───────────┬───────────────────┘                       │
            │ HTTPS (tRPC) + WSS (socket.io)             │ same
            ▼                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               server/ (Express + tRPC + Socket.IO)                │
│  router.ts — SAME routers reused: auth, class, learning, admin,  │
│  student, notification, community, privateMessage, sales, ...    │
│                                                                    │
│  NEW additions required:                                          │
│   - device push-token router/table                                │
│   - push channel in NotificationService.dispatch                  │
│   - VoIP-priority push path for "1to1:incoming_call" /             │
│     "class:started" so calls ring on locked/backgrounded devices  │
└───────────────────────────┬────────────────────────────────────┘
                             ▼
                 PostgreSQL (Drizzle ORM) — same schema
                 + new `device_tokens` table (see §5)
```

The mobile app is **a second client against the same backend**, not a separate service. No new backend framework, no GraphQL layer, no BFF — just: (a) a few new tRPC procedures, (b) one new table, (c) a push-sending integration wired into the existing `NotificationService`.

## 4. The hard problem: making calls actually ring

Today: `classes.startInstantOneToOne` / `startOneToOne` (server/src/routers/classes.ts) emits `io.to("user:{studentId}").emit("1to1:incoming_call", {...})`. This only reaches a client with an **open socket**. Group class start (`classes.start`) similarly emits `class:started` to batch rooms plus sends an in-app notification.

Required redesign for mobile:

1. **New `device_tokens` table** (userId, platform `ios|android`, expoPushToken or raw FCM/APNs token, appVersion, lastActiveAt). Populated by the app on login/token-refresh via a new `user.registerDeviceToken` mutation.
2. **On `1to1:incoming_call` and `class:started`/`class:join_request_approved` events**, in addition to the existing socket emit, the server calls a new `PushService.sendCallPush(userId, payload)` that:
   - Sends a **high-priority/VoIP push** (Android: FCM high-priority data message; iOS: PushKit VoIP push, which is the only push type allowed to wake a killed app for a call UI, paired with Apple's CallKit reporting requirement).
   - The push payload carries `{ type: "incoming_call", sessionId, roomName, callerName, jitsiJwt-fetch-token }` — minimal, since the app fetches full meeting details from `class.getMeetingDetails`/`classes.joinOneToOne` on tap, same as web does today.
3. **Client-side**: a native module (`react-native-callkeep` + `expo-notifications` background handler) turns the VoIP push into a **CallKit (iOS) / ConnectionService (Android)** full-screen ringing UI — system-level, works over lock screen, works app-killed. Accept → app launches into the call screen directly (mirrors `IncomingCallOverlay.tsx`'s accept → `/classes/one-to-one?joinOneToOne=<id>` navigation).
4. **Ordinary notifications** (fee reminders, announcements, feedback prompts, low-balance alerts) use a normal FCM/APNs push (not VoIP) — same `NotificationService.dispatch` gets a `push` channel alongside its existing `in_app`/`email`/`sms`/`whatsapp` channels (the latter two are already stubbed no-ops server-side, per `notificationService.ts`).
5. **Socket connection stays** for while-open real-time UX (typing indicators, live lobby approvals, chat) — push is purely the "wake me up" layer, not a replacement for socket.io.

This is the single biggest net-new engineering effort in the whole project. Everything else below is "build a mobile UI against an API that already exists."

## 5. Backend changes required (additive only — no existing schema/procedure changes)

New table (Drizzle, `server/db/schema.ts`):
```
device_tokens
  id, userId (fk users), platform ('ios'|'android'), token, appVersion,
  lastActiveAt, createdAt
```

New/extended procedures:
- `user.registerDeviceToken` (mutation) — upsert on login/app-open.
- `user.unregisterDeviceToken` (mutation) — on logout.
- Extend `NotificationService.dispatch` with a `push` channel (server/src/lib/notificationService.ts) calling a new `server/src/lib/push.ts` (Expo Push API is the simplest integration point since Expo tokens abstract FCM/APNs — avoids hand-rolling both).
- Extend the `1to1:incoming_call` emit sites (classes.ts ~line 1051, ~1518) and `class.start` (~line 648) to also call `sendCallPush`.
- No changes needed to auth, attendance, ledger, or role logic — the app calls the exact same procedures the web client does for everything except push registration.

Everything else — auth, roles, class lifecycle, attendance, ledger, chat, notifications-list, sales — is consumed as-is via the existing tRPC routers (`auth`, `user`, `learning`, `class`, `admin`, `student`, `students`, `privateMessage`, `notification`, `community`, `discipline`, `salesExecutive`, `sales`, `performance`, `qualifications`, `department`). See `contracts/` for the shared Zod validation the app should import directly, same as the web client does.

## 6. App feature set, by role

The mobile app should NOT try to replicate every admin screen — desk-bound, data-dense admin/sales-reporting workflows stay on web. Feature scope below is split into **mobile-first** (build for launch) and **desk-only, skip** (stays web).

### 6.1 All roles (shared)
- Login (username/password, JWT — same `auth.login`), forced password change gate (mirrors `ForceChangePassword.tsx`).
- Push notification permission + registration on first login.
- Notification inbox (`notification.list`, `markRead`, `markAllRead`) with push-driven badge count.
- In-app announcements (`notification.dismissAnnouncement`).
- Profile view/edit (`user.myProfile`, `updateMyProfile`), change password.
- Notification pause/snooze toggle (`user.updateNotificationPause`).
- Private messaging / DMs (`privateMessage.*`) — 1:1 chat with push on new message.
- Batch group chat (`learning.listMessages`/`sendMessage`/`addReaction`) for enrolled batches — text + voice notes + image/pdf attachment (mirrors `Chat.tsx` message types).

### 6.2 Live sessions — the core feature (all roles)
- **Incoming call screen** (native CallKit/ConnectionService) for 1:1 sessions — Accept/Decline, ringing even when app closed.
- **Join group class**: push/notification when a class starts for the student's batch → tap to join, same lobby-approval flow as web (`classJoinRequests` — `requestJoin`, see status via `getJoinStatus`).
- **In-call UI**: native Jitsi (`@jitsi/react-native-sdk`) against the same self-hosted `meet.gecouncil.com` domain, joined with the JWT from `class.getMeetingDetails` / `classes.joinOneToOne`. Moderator (teacher) view surfaces the waiting-lobby approve/decline panel (mirrors `JitsiMeet.tsx`'s side panel) inline in the call screen.
- **Heartbeat**: app calls `trackOneToOneHeartbeat` (1:1) and the join/leave attendance recorders (`recordJoinTime`/`recordLeaveTime`) exactly as the web client does — do not skip this, it's what feeds `classEngine.ts`'s 20-minute attendance/credit logic.
- **Teacher-side**: start class (`classes.start`), start instant 1:1 call (`startInstantOneToOne`), end/cancel class, approve/decline join requests — all from the phone, so a teacher can run their day without a laptop.
- **Upcoming sessions list / calendar** (`class.list`, `listOneToOne`) with reminders.
- **Reschedule request** (student → `requestReschedule`) and resolve (teacher/admin → `resolveRescheduleRequest`).
- **Attendance history** (`myAttendance`, `mySessionSummary`) and remaining-session balance (from `profiles`/`sessionHelper` counters) — this is the #1 "how many classes do I have left" question students ask, worth a prominent home-screen widget.

### 6.3 Student
- Dashboard: today's classes, remaining session balance, low-balance alerts.
- Learning materials/notes/videos (`learning.listMaterials/listNotes/listVideos`) — read-only browsing, PDF/video viewer.
- Assignments (`learning.listAssignments`, `submitAssignment`) — submission via file/photo upload.
- Fee status + pay fees (`student.myPayments`, `createRazorpayOrder`/`verifyRazorpayPayment`) — Razorpay already integrated server-side; use `react-native-razorpay` client SDK.
- Feedback submission (`student.submitFeedback`).
- Community: lessons, posts/comments, career board (`community.*`) — read + light interaction (like/comment); admin moderation (pin/delete) stays web-only.
- Requests (hold/rejoin/batch-change) — create + view status (`student.createRequest`, `myRequests`).
- Enroll-in-batch / referral self-registration flow (`salesExecutive.registerStudentWithReferral`, `student.enrollInBatch`) — useful if referral links are shared and opened on mobile.

### 6.4 Teacher
- Everything in 6.2 (run classes) plus: my batches, my students, salary view (`user.mySalaries`, `myExportSalaryReport`), assignment review (`learning.reviewSubmission`), attendance report for own classes.

### 6.5 Academic Head / Admin / Super Admin (mobile = "approve & monitor on the go", not full desk parity)
- Approvals: requests (`admin.listRequests`/`resolveRequest`), reschedule/hold approvals, violation review (`admin.listViolations`/`resolveViolation`/`suspendUser`).
- Push-driven alerts: attendance alerts (7-consecutive-absence), low session balance, overdue payments — admins get these as push so they can act without opening a laptop.
- Dashboard summary (`admin.getDashboardStats`) — condensed mobile card view, not the full desktop reporting suite.
- **Explicitly desk-only (skip on mobile v1)**: bulk student import/export, salary config editing, fee-rule editing, report generation/export (PDF/Excel), qualification management, department restructuring, points-engine config, hierarchy management — these are low-frequency, form-heavy, desktop-appropriate workflows already well served by the web app.

### 6.6 Sales Executive
- Leaderboard + own performance (`salesExecutive.getPerformanceDashboard`).
- Demo class scheduling/joining (`salesExecutive.completeDemoClass`, `getDemoJoinToken`, `demoClasses` — this is a Jitsi call too, same native call UI applies) — **field sales reps booking/joining demo calls from a phone is a strong mobile use case**, worth prioritizing alongside 1:1 teaching calls.
- Referral link sharing (own `getReferralInfo`).
- New closure entry (`sales.*` closure creation) — quick-entry form for logging a sale on the go.
- **Desk-only, skip**: hierarchy management, points-rule config, reconciliation upload, full sales reports/exports.

## 7. Data & real-time contract the app must implement

Socket events to subscribe to (all delivered to the personal room `user:{id}`, joined automatically on authenticated socket connect — see `server/src/lib/socketHandlers.ts`):
`notification:new`, `1to1:incoming_call`, `class:started`, `class:ended`, `class:cancelled`, `class:updated`, `class:join_request_new/status/updated/updated_all`, `private_message:new/edit/delete`, `message:new` (batch chat — requires explicit `batch:join`/`batch:leave` room emits when viewing a batch's chat).

Auth: JWT from `auth.login` stored in secure device storage (NOT `localStorage` — use `expo-secure-store`), sent as tRPC header and as socket.io handshake `auth: { token }`, identical to the web client's contract. Note the login JWT currently has **no expiry** (see §9 risk) — the app should still implement token refresh/logout handling defensively.

## 8. Non-goals for v1

- No offline-first data layer (tRPC + React Query cache is enough; no local SQLite mirror).
- No native rewrite of admin reporting/exports.
- No WhatsApp/SMS sending from the app (those channels are server-side stubs today — out of scope until the backend actually integrates a provider).
- No multi-tenant/white-label support — single deployment, same as web.

## 9. Risks / pre-existing issues worth fixing alongside the mobile build

- **Login JWT has no expiry** (`auth.ts` — Jitsi JWTs correctly expire in 6h, but the app session JWT doesn't). Worth adding expiry + refresh before shipping a mobile app that will keep tokens on-device long-term.
- **Deploy scripts are inconsistent** (see PLAN.md) — resolve before adding a third deployable (mobile builds still need a stable, versioned API).
- **`APP_SECRET` has a hardcoded dev fallback** (`server/src/lib/env.ts`) — confirm production always sets it explicitly; a mobile app widens the attack surface for token forgery if not.
- Multi-device session enforcement is currently disabled (commented out in `middleware.ts`) — decide whether a phone + laptop logged in simultaneously is intended behavior (probably yes, for this use case) and remove the vestigial single-device `deviceToken` check rather than leaving dead code.
