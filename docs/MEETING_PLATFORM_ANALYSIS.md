# Can we replace Jitsi with Google Meet? — Feasibility report

Prepared 2026-10-23. Sources are linked at the bottom; anything I could **not** confirm is marked **(unverified)**.
Numbers about your system come from the live database (read-only counts).

---

## 1. Bottom line

**Google Meet is possible but a poor fit. I recommend against it.** Four reasons, strongest first:

1. **Students and teachers would leave your app to take a class.** Google offers no way to embed a Meet call inside your website or
   mobile app. Its add-on SDK works the opposite way (your app appears *inside* Meet). So the incoming-call screen, the
   in-app call screen, picture-in-picture and the join/leave tracking you have built would not apply to the call itself.
2. **Attendance by Google account does not fit your data.** Meet identifies people by Google account. Only **43 of your 1,649
   students have any email on file** (42 Gmail). Guests can join Meet without an account and then appear only as a typed
   display name, which cannot be matched to a student record reliably.
3. **Google's own documentation says the API "isn't intended for performance tracking or user evaluation within your
   domain" and "Meet data shouldn't be collected for this purpose."** Your reports drive teacher pay and student credits. That is
   a policy risk that must be cleared with Google before building on it.
4. **Cost and setup.** Teachers would need Google Workspace accounts (about ₹270 per user per month, ~₹15,660 + GST for 58
   teachers) and the Meet API sits behind Google's app-verification process.

**What Meet *would* fix:** no video server to run or tune, and Google's mobile app is well optimised for heat and data use.
But the lag and heating you reported came mainly from an **undersized server (t3.small) and an app asking for HD video**, both
already addressed (new t4g.medium, 360p cap). Switching platforms before proving the new setup is premature.

**Recommended path:** run real classes on the new server for a week and measure. If video is still unsatisfactory, move to a
managed Jitsi (**JaaS**) or **LiveKit**, not Google Meet. Both keep the call inside your app and give the server direct, exact
join/leave events. Details in sections 5–7.

---

## 2. What your system needs from a meeting platform

| Need | Why it matters here |
|---|---|
| Call opens **inside** the Emtees web page and mobile app | Teachers/students never leave the app; incoming-call prompt, PiP, heartbeat |
| Only the right people can join (login-based access) | Paid 1-to-1 classes; currently done with signed tokens (JWT) |
| **Exact join/leave per person**, mapped to a student/teacher record | Drives the 20-minute rule, class credits, teacher salary, reports |
| Short-drop handling (rejoin within 5 min) | Network drops are common |
| Control over video quality | Phones overheating / data use were real complaints |
| Works for **~58 teachers and ~1,650 students**; this month ~6,600 scheduled 1-to-1 sessions (over 99% are 30 minutes) | Cost and capacity |
| Low operations burden | One small team |

Usage today (live database, Oct 2026): **1,649 active students, 58 teachers**; this month **40 teachers and 448 students** have
had at least one 1-to-1 session scheduled, and 6,613 sessions are scheduled (158 completed so far, because tracking only started
recently). 6,593 of them are 30-minute sessions.

## 3. How the system uses Jitsi today (what a switch would touch)

| Layer | Files involved |
|---|---|
| Server | `lib/jitsi.ts` (signs tokens), `routers/classes.ts`, `community.ts`, `learning.ts`, `salesExecutive.ts`, `students.ts`, `webhooks.ts`, `lib/scheduler.ts`, `lib/classEngine.ts`, `db/schema.ts`. About **8 places create tokens** and about **38 references to room id/URL**. |
| Web | `components/JitsiMeet.tsx`, used by Classes, Dashboard, Community and Sales Demo pages |
| App | `features/call/call_screen.dart`, `core/config.dart`, `config/*.json`, `pubspec.yaml` (`jitsi_meet_flutter_sdk`) |

**The good news — a clean seam.** Everything downstream of "how many minutes was each person in the call" is independent of the
video platform: class credits, attendance rows, salary, and every report. That is one function,
`computeParticipantMinutes` (`server/src/lib/sessionMinutes.ts`), fed by the `attendance_events` table. Replacing the platform
means replacing **who writes those events** and **how people join**, not the reports.

Today the events are written by the web page and the app themselves (they tell the server when they join and leave), because the
Jitsi server never sends them. That works but is "client-reported": a crashed phone sends no "left" message.

## 4. Option A — Google Meet (what it would take)

### 4.1 How it would work
1. When a class is scheduled, the server calls the **Meet REST API** to create a *meeting space* and stores its link.
2. Teacher and student tap **Join**; their phone/browser opens the Google Meet app or meet.google.com. (No embedding is available.)
3. After or during the class, the server reads **who attended and when** from the API
   (`conferenceRecords → participants → participantSessions`, each with a start and end time; a rejoin creates a new session).
   Active people can be found with `endTime IS NULL`. Near-real-time updates are possible through the Workspace Events API
   (e.g. `google.workspace.meet.participant.v2.joined`), with polling as the fallback.
4. Those sessions are converted into the same join/leave rows the reports already use. The credit, attendance and salary logic is unchanged.

### 4.2 What blocks or complicates it

| Issue | Detail |
|---|---|
| **No embedding** | Searches and Google's docs show only "your app inside Meet" (Meet Add-ons SDK), not "Meet inside your app". Every class would open outside Emtees. |
| **Identity mapping** | Only people signed in to a Google Account get a stable user id; anonymous guests and phone dial-ins only have a display name. The participant record carries **no email**; you must look it up through Google's People API, which may not return it for everyone. With 43 of 1,649 student emails on file, you would first have to collect and verify a Google account for every student (many children, some without Gmail). |
| **Policy risk** | Google states the API is not intended for performance tracking or user evaluation, and Meet data should not be collected for that purpose. Using it to compute teacher pay and attendance penalties is likely to be judged "performance tracking". Needs written confirmation from Google before any build. |
| **Authentication** | The Meet API accepts **user authentication only**; plain service accounts do not work. The server-to-server route is **domain-wide delegation**, which needs a Google Workspace domain and a Workspace administrator. The scopes you need (`meetings.space.created`, `meetings.space.readonly`) are *sensitive* and require Google's app verification (can take days to weeks); downloading recordings uses *restricted* scopes with a stricter review. |
| **Access control** | Today a signed token decides who may enter. In Meet you would depend on the space's access type and on admitting ("knocking") people. Guests can join by name with host approval, so a leaked link is a risk. **(Exact access-type options unverified: the Google page could not be loaded.)** |
| **Meeting limits** | Free Google accounts: group calls (3+ people) are capped at **60 minutes**; 1-to-1 calls up to 24 hours (one source says no limit; treat 24 hours as the safe figure). Paid Workspace plans allow up to 24 hours. Your sessions are 30–60 minutes, so a free host account is workable for 1-to-1 but tight for 60-minute group classes. |
| **Cost** | Workspace Starter-level plan is **₹270 per user per month (annual commitment, excluding 18% GST)** according to a June 2026 reseller survey. For 58 teachers: about **₹15,660 per month, ₹18,479 with GST**. Students could join as unlicensed guests. Confirm current pricing on Google's India page. |
| **Lost features** | In-app incoming call during the class, picture-in-picture inside Emtees, 360p/bitrate limits, the "Counted" live status inside the app screen, our own join/leave timeline for support. |
| **Data and dependence** | Student and teacher call data lives with Google; quotas and API changes are outside your control. |

### 4.3 Rough effort (my estimate, not a quote)
- Create spaces + join links on web/app: **3–5 days**.
- Attendance import (polling or events) mapped into the existing tables: **4–7 days**.
- Collecting and verifying a Google account for ~1,650 students, plus onboarding teachers on Workspace: **weeks of operations work**, not code.
- Google app verification and policy confirmation: **days to weeks**, outside your control.
- Remove Jitsi from web, app and server and re-test everything: **5–8 days**.
Overall: **roughly 3–5 weeks of work plus the account-collection effort**, for a result with fewer features than today.

### 4.4 If you still want Meet
Use it only as a **link-out fallback** (for example when someone cannot use the app), not as the primary call. Keep Jitsi (or a managed
service) inside the app, and treat Meet attendance as unverified.

## 5. Better alternatives that keep the call inside your app

### Option B — JaaS (8x8's managed Jitsi)
- **Same Jitsi technology and the same web and mobile SDKs**, so the code change is small: new domain, new token format, new app id. No server of your own to run or tune.
- Priced per **monthly active user** (a MAU is a unique person who attended at least one meeting with another person that month). Public plan prices: free
  developer tier (25 users), Basic $99/month, Standard $499/month, Business $999/month, extra users $0.99 each; recording $0.01/minute.
  This month's real activity is ~490 people (40 teachers + 448 students), so budget about **$500/month** at current volume
  **(plan allowances and webhook features unverified; confirm with 8x8)**.
- Likely **2–4 days** of work plus testing. The lowest-risk way to remove server-lag problems if the new server is not enough.

### Option C — LiveKit (open source, self-hosted or LiveKit Cloud)
- Gives the server **direct, exact `participant_joined` / `participant_left` webhooks** (documented), so attendance no longer depends on phones reporting themselves. Crashes and force-closes are recorded correctly.
- Open source (Apache 2.0) to run yourself, or usage-based cloud plans (Build free, Ship $50/month, Scale $500/month, Enterprise custom; confirm allowances on LiveKit's pricing page).
- A Flutter client library exists **(not confirmed in this research)**. You would **build the call screen yourself** (no ready-made Jitsi UI), including mute/camera/PiP and the incoming-call flow.
- Roughly **2–4 weeks** including web and app UI.

### Option D — Stay on self-hosted Jitsi (what is in place now)
- Already done: new `t4g.medium` server, memory limits, 360p/bitrate caps, hardware H.264, joins/leaves tracked by the clients.
- Cheapest, and the reports already work on it. Remaining risk: shared CPU on a burstable instance, and "client-reported" attendance.
- Hardening if needed: move Jitsi to its **own** compute-optimised instance, and add per-minute heartbeats so a crashed phone is closed out within about 2 minutes.

## 6. Side-by-side

| | Google Meet | JaaS | LiveKit | Current Jitsi |
|---|---|---|---|---|
| Call inside the Emtees web/app | **No** | Yes | Yes (build UI) | Yes |
| Server-side join/leave events | Yes (API/Events) | Likely (confirm) | **Yes (webhooks)** | No (clients report) |
| Maps to your student records | **Hard** (Google account needed) | Yes (your own ids in token) | Yes (your own ids) | Yes |
| Run a video server yourself | No | No | Self-host or cloud | Yes |
| Policy risk for pay/attendance use | **Yes** | No known | No known | None |
| Monthly cost (rough) | ~₹18.5k + GST licences | ~$500 | usage/self-host | Server cost |
| Effort | 3–5 weeks + onboarding | 2–4 days | 2–4 weeks | Done |
| Keeps current app features | **Loses several** | Keeps | Rebuild | Keeps |

## 7. Recommended plan

1. **This week:** run normal classes on the new server and measure: phone temperature/data use (compare with the earlier 360p cap), server CPU during peak
   (`top`, CloudWatch CPU credits), and whether lag remains. Run at least one real teacher+student class and check the live "Counted" report.
2. **Close the crash gap (small job):** have the 1-to-1 heartbeat close a participant who goes silent for ~2 minutes, so a dead phone cannot inflate minutes.
3. **Decide after the measurements:**
   - Video fine → stay on Jitsi (Option D).
   - Lag remains because of the server → move Jitsi to its own instance, or choose **JaaS (B)** for a quick managed fix.
   - You want exact server-side attendance and full control of the experience → plan **LiveKit (C)**.
   - Google Meet → only after Google confirms in writing that attendance-for-pay is an allowed use, and after a Google account is verified for every student.

## 8. What I could not verify
- The exact access-type options and member controls when creating a Meet space (the Google page returned an error).
- Whether personal Google accounts, not only Workspace, may use the Meet REST API (Google's overview does not say).
- How Meet links open on phones (deep link vs forced install) and what guests see.
- JaaS: plan allowances and whether it provides participant join/leave webhooks.
- LiveKit: current plan allowances and Flutter SDK status.
- Reseller prices vary widely (₹81–₹270 for the starter plan); ₹270 is the most consistent 2026 figure.

## Sources
- Meet REST API overview and policy note: https://developers.google.com/workspace/meet/api/guides/overview
- Meet participants and participant sessions: https://developers.google.com/workspace/meet/api/guides/participants and https://developers.google.com/meet/api/reference/rest/v2/conferenceRecords.participants.participantSessions
- Meet API authentication and scopes: https://developers.google.com/workspace/meet/api/guides/authenticate-authorize
- Meet spaces: https://developers.google.com/workspace/meet/api/guides/meeting-spaces
- Meet events (Workspace Events API): https://developers.google.com/workspace/events/guides/events-meet
- Meet Add-ons SDK (apps inside Meet): https://workspaceupdates.googleblog.com/2024/09/google-meet-add-ons-sdk-is-now-available.html
- Guests joining on mobile: https://workspaceupdates.googleblog.com/2024/01/join-a-meeting-without-a-google-account-on-mobile.html
- Meet time limits: https://tldv.io/blog/google-meet-time-limit/
- Workspace India pricing: https://unicoconnect.com/google-workspace-pricing-india
- LiveKit webhooks: https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events.md and pricing https://livekit.io/pricing
- JaaS pricing: https://cpaas.8x8.com/en/pricing/jitsi-as-a-service-pricing/
