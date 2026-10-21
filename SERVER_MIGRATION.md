# Emtees — Server Inventory and Migration Plan (to a new EC2 instance)

Written from a read-only inspection of the live server on 2026-10-21. **No secret values are in this file.**
Use it to build a new server (target: `t4g.medium`) and move production to it with a rollback path.

> Everything below marked **(verify)** is something that could not be confirmed from the old server and must be
> checked on the new one before cutover.

---

## 0. Status of the new server (updated 2026-10-21)

New instance: `t4g.medium`, ARM64, hostname `ip-172-31-23-74` (private `172.31.23.74`), public `52.66.45.63`.
**Built and tested, but not live: DNS still points to the old server.**

Done and verified on the new server:
- Node 24.19.0 (arm64), pm2, nginx, certbot, 2 GB swap.
- Backend deployed with `EMTEES_HOST=52.66.45.63 ./deploy.sh`; `emtees-api` is running and connected to the database.
  **`DISABLE_SCHEDULER=1` is set in its `.env`**, so it does not run background jobs while the old server is still live.
- nginx site `emtees` with the copied Let's Encrypt certificates; tested through the real domain with
  `curl --resolve gecouncil.com:443:52.66.45.63 ...` (web 200, API ok, app APK download ok).
- Jitsi installed (all packages exist for ARM64): JWT login with App ID `emtees` and the same secret as the backend
  (compared by fingerprint), nginx site created from the package template, certificate links created, the video
  bridge registered with Jicofo with no health failures, `statichost` set to private `172.31.23.74` / public `52.66.45.63`,
  TCP fallback port 4443, heaps limited to 1024 MB (bridge) and 512 MB (Jicofo), and `single-participant-timeout: 120 minutes`.

Differences from the plan above that were found while doing it:
- The Jitsi installer did **not** create its nginx site or the `/etc/jitsi/meet/*.crt|key` links, even with "own
  certificate" preseeded. They were created by hand from `/usr/share/jitsi-meet-web-config/jitsi-meet.example`
  (the same steps the installer's script performs).
- Memory limits are read from `VIDEOBRIDGE_MAX_MEMORY` (in `/etc/jitsi/videobridge/config`) and `JICOFO_MAX_MEMORY`
  (in `/etc/jitsi/jicofo/config`); both confirmed to take effect.
- `certbot renew --dry-run` fails until DNS points at the new server (expected); re-run it right after cutover.
- Package versions on the new server are slightly newer than the old one (jitsi-meet 2.0.11248, JVB 2.3-318, Jicofo 1.0-1205).

Still to do at cutover (see section 8): remove `DISABLE_SCHEDULER=1` from the new `.env` and restart, stop the old API,
change the GoDaddy A records for `gecouncil.com` and `meet.gecouncil.com`, then run the verification checklist (section 9).
Confirm that `52.66.45.63` is an **Elastic IP**; if it is not, allocate one and re-run the `jvb.conf` address step.

## 1. What runs on the current server

One EC2 machine runs **everything**:

| Piece | Details |
|---|---|
| Instance | `t3.small` (2 vCPU, 1.9 GB RAM, **no swap**), Ubuntu 26.04 LTS, **x86_64**, 28 GB disk (29% used) |
| Region / network | `ap-south-1`, AZ `ap-south-1a`, VPC `vpc-0fadd55460d96e8b0`, subnet `subnet-0cd03bec1b9da90ce` |
| Security groups | `launch-wizard-1` (`sg-0ac3ac5affa3b3af4`) and **`ec2-rds-1`** (`sg-0f3c6f7bfae6be097`) |
| IP | Public `13.235.121.148` (**not** an Elastic IP: it changes if the instance is stopped), private `172.31.35.130` |
| IAM role | none |
| DNS | GoDaddy (`ns47/ns48.domaincontrol.com`). `gecouncil.com` and `meet.gecouncil.com` → the server IP. `www.gecouncil.com` → Vercel (separate site, not affected) |
| Database | AWS RDS PostgreSQL `emteesapp.c302uq0iwo7z.ap-south-1.rds.amazonaws.com` (separate from the EC2 box; **data does not move**) |
| Node / process manager | Node **v24.19.0** (via nvm), **pm2 7.0.3**, process `emtees-api`, started at boot by `pm2-ubuntu.service` |
| How the API is started | `npm run dev` (= `tsx src/index.ts`, i.e. the TypeScript source, **not** the compiled build), working dir `/home/ubuntu/emtees-api/server`, port **3000** |
| Web files | `/var/www/emtees/client/dist` (owner `www-data`), served by nginx |
| nginx | site `emtees` (gecouncil.com) and site `meet.gecouncil.com` (stock Jitsi site) |
| TLS certificates | Let's Encrypt via certbot (nginx plugin): `gecouncil.com` and `meet.gecouncil.com`, renew automatically (`certbot.timer`), currently valid to 2026-12-04 |
| Jitsi (video) | Installed from the Jitsi apt packages (not Docker): `jitsi-meet` 2.0.11146, `jitsi-videobridge2` 2.3-307, `jicofo` 1.0-1189, `jitsi-meet-prosody`, `jitsi-meet-web`, `jitsi-meet-web-config`, **`jitsi-meet-tokens`** (JWT login), `jitsi-meet-turnserver` + `coturn`, `prosody` 13.0.4, `openjdk-17-jre-headless` |
| Firewall | `ufw` is **inactive**; the only firewall is the AWS security groups |
| Cron | none (the scheduler runs inside the API process every minute) |
| Stored files | `/home/ubuntu/emtees-api/server/storage/app-releases` (137 MB of past app APKs; only the latest is needed) |

### Backend environment variables (names only; values are in the private bundle)
`APP_ID`, `APP_SECRET`, `DATABASE_URL`, `JITSI_APP_ID`, `JITSI_APP_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `STUDENT_ID_PREFIX`, `RECORDING_RETENTION_DAYS`.
Not set but should be: `RELEASE_PUBLISH_SECRET`. The file is `/home/ubuntu/emtees-api/server/.env` and the RDS certificate
bundle is `/home/ubuntu/emtees-api/server/global-bundle.pem`.

### Jitsi setup facts (needed to rebuild it identically)
- Domain `meet.gecouncil.com`; prosody virtual host uses `authentication = "token"` with `app_id = "emtees"`; the
  secret must equal the backend's `JITSI_APP_SECRET` (and `JITSI_APP_ID` = `emtees`).
- The conference room component has `restrict_room_creation = true` and uses `token_verification`.
- `config.js` (`/etc/jitsi/meet/meet.gecouncil.com-config.js`) is the **unmodified package default** — nothing to copy.
- Jicofo is customised only with `single-participant-timeout: 120 minutes`.
- The videobridge's public address is set in `/etc/jitsi/videobridge/jvb.conf`
  (`ice4j.harvest.mapping.statichost { local-address = <private IP>, public-address = <public IP> }`). This **must be
  updated for the new machine**.
- JVB and Jicofo are both started with `-Xmx3072m`, which is more than the 1.9 GB the machine has.
- coturn (TURN/STUN) is installed and enabled with the realm `meet.gecouncil.com`.
- Ports used: TCP 80/443 (nginx), TCP 5222/5269/5281 (prosody), **UDP 10000** (video media), UDP 3478 and
  TCP 5349 (coturn), TCP 4443 (JVB TCP fallback), TCP 3000 (API, behind nginx).

## 2. Important: why the database "just works" from the server
The RDS database only accepts connections from servers carrying the security group **`ec2-rds-1`**. The new
instance **must have `ec2-rds-1` attached**, in the **same VPC** (`vpc-0fadd55460d96e8b0`), or it will not reach the
database. Check in the AWS console: RDS → `emteesapp` → Connectivity → VPC security groups (it should contain the matching
`rds-ec2-1` group that allows `ec2-rds-1`).

## 3. Decisions to make before starting

1. **t4g (ARM/Graviton) vs x86.** The Node app is pure JavaScript (no native add-ons were found in `node_modules`),
   so it runs on ARM after a fresh `npm install`. Java, nginx, prosody and coturn all have ARM builds. The one
   unknown is the Jitsi apt repository's ARM64 packages, e.g. `lua-cjson` (the old server uses an amd64 build)
   **(verify)**: after adding the Jitsi repo on the new machine run `apt-cache policy jitsi-meet lua-cjson` — if any
   Jitsi package has no arm64 candidate, use an x86 instance instead (`t3.medium` or `m6i.large`).
2. **One machine or two.** Putting the API *and* the video bridge on one `t4g.medium` (2 vCPU, 4 GB) is a big
   improvement over today (4 GB RAM instead of 1.9, no swap problem) but video and the API still share CPU, and `t4g` is a
   burstable type just like `t3` (it slows down or bills extra when CPU credits run out). The more robust layout is
   **two machines**: the API/web on a small instance, Jitsi alone on a compute instance (e.g. `c7g.large`). The
   steps below work for either; for two machines follow §6 on the Jitsi machine and §5 on the other.
3. **Elastic IP.** Allocate one and use it for the new server so the address never changes again.

## 4. Create the instance (AWS console)

1. EC2 → **Allocate Elastic IP address** (note it: `NEW_IP`).
2. EC2 → **Launch instance**:
   - Name `emtees-prod-2`; AMI **Ubuntu Server (64-bit Arm)** — use the same Ubuntu release as now (26.04) if offered, otherwise
     24.04 LTS; type **t4g.medium**.
   - Key pair: the **same key pair** you use for `emtees.pem` (so the same key logs in).
   - Network: VPC `vpc-0fadd55460d96e8b0`. **Any Availability Zone works** (security groups and the RDS access are VPC-wide).
     On 2026-10-21 `t4g.medium` had no capacity in `ap-south-1a` (the old server's zone), so choose a subnet in
     **`ap-south-1b` or `ap-south-1c`** (Network settings → Edit → Subnet). Do not pick "no preference": that can land in a
     different VPC without database access. Set *Auto-assign public IP* = Enable (the Elastic IP replaces it afterwards).
   - Security groups: choose **existing** `launch-wizard-1` **and** `ec2-rds-1` (this copies all the open ports and the
     database access). Make sure UDP **10000** is open from anywhere; restrict SSH (22) to your own IP.
   - Storage: 30 GB gp3.
3. After it starts: **Associate** the Elastic IP with it.
4. Keep the old instance **running and untouched** (do not stop it: its IP would change and you would lose the rollback).

> **zsh tip (macOS):** paste commands without `#` comment lines (zsh rejects them in the terminal) and replace every
> `<placeholder>` with a real value first. Set the variables below in the **same** terminal window before running any
> command that uses `$KEY`, `$OLD` or `$NEW`, or the commands will fail with errors like "Identity file ubuntu@ not accessible".

Set shell variables on your Mac to keep the commands short:
```bash
export OLD=13.235.121.148
export NEW=52.66.45.63
export KEY=~/Projects/Emtees/emtees.pem
```

## 5. Prepare the new server (API + web)

```bash
ssh -i $KEY ubuntu@$NEW
```
On the new server:
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx certbot python3-certbot-nginx git curl unzip
# swap (safety net against memory spikes)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Node 24.19.0 via nvm + pm2 (same as today)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. ~/.nvm/nvm.sh && nvm install 24.19.0 && nvm alias default 24.19.0
npm install -g pm2
mkdir -p ~/emtees-api/server /var/www/emtees/client
```
From your **Mac**, copy the secrets and storage from the old server through your laptop:
```bash
# .env and the RDS certificate
scp -3 -i $KEY ubuntu@$OLD:~/emtees-api/server/.env            ubuntu@$NEW:~/emtees-api/server/.env
scp -3 -i $KEY ubuntu@$OLD:~/emtees-api/server/global-bundle.pem ubuntu@$NEW:~/emtees-api/server/global-bundle.pem
# latest app APK only (the database manifest points at one file)
ssh -i $KEY ubuntu@$OLD 'ls -t ~/emtees-api/server/storage/app-releases | head -1'
# then copy that one file:
ssh -i $KEY ubuntu@$NEW 'mkdir -p ~/emtees-api/server/storage/app-releases'
scp -3 -i $KEY ubuntu@$OLD:~/emtees-api/server/storage/app-releases/<that file> ubuntu@$NEW:~/emtees-api/server/storage/app-releases/
```
Deploy the code with the normal script, pointed at the new IP. **Run `EMTEES_HOST=$NEW ./deploy.sh`** (it reads the target from `EMTEES_HOST` and defaults to `gecouncil.com`). (Better: replace the IP in `deploy.sh` with the domain `gecouncil.com`, so it never needs editing
again.) The first run will fail at the final `pm2 restart emtees-api` because the process does not exist yet; that is
expected. Then on the new server:
```bash
cd ~/emtees-api/server && npm install
pm2 start npm --name emtees-api -- run dev     # same start command as production today
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu   # then run the sudo command it prints
sudo chown -R www-data:www-data /var/www/emtees/client/dist
```
> **Do not start `emtees-api` on the new machine while the old one is still running against the same database**
> unless you are testing — the scheduler would run twice (duplicate notifications and double processing). For
> testing, start it, check, then `pm2 stop emtees-api` until the cutover.

**nginx for the web app** — create `/etc/nginx/sites-available/emtees` (then `sudo ln -s` it into `sites-enabled`):
```nginx
server {
    server_name gecouncil.com;
    client_max_body_size 250M;
    location / {
        root /var/www/emtees/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    listen 80;
}
```
Then copy the existing certificates so HTTPS works from the first second (from your Mac):
```bash
ssh -i $KEY ubuntu@$OLD 'sudo tar czf - /etc/letsencrypt' | ssh -i $KEY ubuntu@$NEW 'sudo tar xzf - -C /'
```
and run `sudo certbot --nginx -d gecouncil.com --reinstall` on the new server after DNS points to it (this rewrites the
`listen 443 ssl` lines and the redirect, exactly as on the old server). Test with `sudo nginx -t && sudo systemctl reload nginx`.

## 6. Jitsi on the new server (same box, or the separate Jitsi machine)

Follow the official quick-install and then make it match the old setup:

1. **Security groups / ports:** UDP 10000, TCP 80/443, TCP 5349, UDP 3478 (and TCP 4443) open.
2. **Hostname:** `sudo hostnamectl set-hostname meet.gecouncil.com`, and add `127.0.0.1 localhost meet.gecouncil.com` to `/etc/hosts`.
3. **Add repos and install** (official instructions: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart):
   prosody repo, Jitsi stable repo, then `sudo apt install jitsi-meet`.
   - Hostname when asked: `meet.gecouncil.com`.
   - Certificate: choose **"I want to use my own certificate"** and give the Let's Encrypt paths you copied in §5
     (`/etc/letsencrypt/live/meet.gecouncil.com/fullchain.pem` and `privkey.pem`), or the self-signed one for now.
   - **(verify)** If `apt` reports an unavailable arm64 package, stop and switch the Jitsi machine to x86.
4. **JWT login:** `sudo apt install jitsi-meet-tokens`. When asked, use **App ID `emtees`** and the **same secret as the
   backend's `JITSI_APP_SECRET`** (it is in `server/.env`). Afterwards confirm in
   `/etc/prosody/conf.avail/meet.gecouncil.com.cfg.lua`: `authentication = "token"`, `app_id="emtees"`,
   `app_secret=` equal to the backend's, and `token_verification` in the conference component.
5. **Videobridge public address.** Edit `/etc/jitsi/videobridge/jvb.conf` and add (merge with what is there; keep the
   `videobridge { ... }` part the installer wrote):
   ```
   ice4j {
     harvest {
       mapping {
         aws { enabled = false }
         statichost {
           local-address  = "<new instance PRIVATE IP>"
           public-address = "<NEW Elastic IP>"
         }
         stun { addresses = [ "meet-jit-si-turnrelay.jitsi.net:443" ] }
       }
     }
   }
   ```
6. **Java memory limits.** The old machine used 3 GB heaps on a 1.9 GB host, which is unsafe. On the new one:
   ```bash
   sudo grep -n "MAX_MEMORY" /etc/jitsi/videobridge/config /etc/jitsi/jicofo/config
   ```
   and set `VIDEOBRIDGE_MAX_MEMORY=1024m` and `JICOFO_MAX_MEMORY=512m` (on a shared 4 GB machine; use larger values on a
   dedicated Jitsi machine). **(verify)** the variable names printed by the command above.
7. Optional, to match the old behaviour: in `/etc/jitsi/jicofo/jicofo.conf` add
   `conference { single-participant-timeout: 120 minutes }` inside `jicofo { ... }`.
8. Restart in this order: `sudo systemctl restart prosody jitsi-videobridge2` then `sudo systemctl restart jicofo`, then check
   `sudo tail -n 40 /var/log/jitsi/jicofo.log` — there must be **no** "Health check failed" or "no operational bridges" lines.

## 7. Test everything BEFORE changing DNS

From your Mac, bypass DNS so you test the new server with the real domain names:
```bash
curl -s --resolve gecouncil.com:443:$NEW https://gecouncil.com/api/mobile/app-releases/latest?platform=mobile
curl -sI --resolve meet.gecouncil.com:443:$NEW https://meet.gecouncil.com | head -3
```
(or temporarily add `<NEW> gecouncil.com meet.gecouncil.com` to your Mac's `/etc/hosts`, test in the browser and the
app, then remove it). Check: the site loads, you can log in, the Teacher Reports page loads, a test call connects with
video, and the new API logs show `Server is running and ready on http://localhost:3000`. Remember to stop the new API
(`pm2 stop emtees-api`) again if the old one is still serving users.

## 8. Cutover (short, planned)

Do this at a quiet time (no live classes).

1. **A day before:** in GoDaddy DNS, lower the TTL of the `gecouncil.com` and `meet.gecouncil.com` A records to the minimum.
2. **At cutover:**
   1. Old server: `pm2 stop emtees-api` (stops the scheduler there).
   2. New server: `pm2 start emtees-api` (or `pm2 restart emtees-api --update-env`).
   3. GoDaddy: change the A records for **`gecouncil.com`** and **`meet.gecouncil.com`** to `NEW` (leave `www` alone — it is on Vercel).
   4. New server: if you did not copy the certificates, run `sudo certbot --nginx -d gecouncil.com -d meet.gecouncil.com`.
3. **Verify** (§9). The mobile app and web use the domain names, so **no app update is needed**.
4. **Rollback (if something is wrong):** in GoDaddy point both A records back to `13.235.121.148`, then on the old server
   `pm2 start emtees-api` (and `pm2 stop emtees-api` on the new one). It works only while the old instance is still running.
5. Keep the old instance running (idle) for about a week, then take a final snapshot and terminate it.

## 9. Verification checklist after cutover

- [ ] https://gecouncil.com loads; login works for admin, a teacher and a student.
- [ ] `pm2 logs emtees-api` on the new server shows no errors; the scheduler line `Background scheduler started` appears.
- [ ] Only **one** server has `emtees-api` running.
- [ ] A real class: teacher starts, student gets the incoming call, both join, video and audio work, both leave; after the
      minimum time the Sessions report shows each person's minutes.
- [ ] App update still works: `curl https://gecouncil.com/api/mobile/app-releases/latest?platform=mobile` and the APK downloads.
- [ ] `sudo certbot renew --dry-run` succeeds on the new server (auto-renewal works).
- [ ] `sudo tail -n 40 /var/log/jitsi/jicofo.log` shows no bridge health failures.
- [ ] Email sending (SMTP) and a payment test (Razorpay) still work, if you use them.

## 10. After the move

1. Set `RELEASE_PUBLISH_SECRET` in the new server's `.env` and `pm2 restart emtees-api --update-env`; then `scripts/publish_release.sh` in the app repo works.
2. Update the server IP in the docs/scripts (`deploy.sh`, `DEPLOYMENT.md`, `HANDOVER.md`, the app's `scripts/publish_release.sh`) — or better, switch them to `gecouncil.com`.
3. Create an **AMI snapshot** of the new server, and add a CloudWatch alarm on **CPU credit balance** (`CPUCreditBalance`) so you see it before video slows.
4. Rotate the secrets you shared with the colleague (database password, `APP_SECRET`, SMTP, Razorpay, Jitsi secret, SSH key).

## 11. Things found on the old server worth knowing

- The old server's home folder contains many leftover files (`dist_new*`, `emtees-deploy*.tar.gz`, test `.ts` scripts in
  `server/`) from earlier manual deploys. **Do not copy them**; a fresh `deploy.sh` is cleaner.
- `www.gecouncil.com` is a different site on Vercel; do not change that record.
- The nginx `emtees` site still lists the old IP `13.235.19.185` as a `server_name` (harmless; omitted above).
- Port 3000 (the API) listens on all interfaces; it should not be open in the security group (nginx proxies it). **(verify)**
  in the security group that 3000 is not open to the internet on the new server.
