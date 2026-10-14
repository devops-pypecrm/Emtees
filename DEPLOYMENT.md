# Emtees Deployment Guide (AWS EC2)

This is the only supported way to deploy the backend **and** the web app: one script.

## 1. Deploy

From the repo root, in a terminal that has `ssh`, `scp` and `tar` (macOS/Linux, or Git Bash on Windows):

```bash
./deploy.sh
```

It will:
1. Build the server (`npm run build --workspace=server`) and the web client (`npm run build --workspace=client`).
2. Package the server (`src`, `db`, `dist`, `package.json`, `tsconfig.json`) and `contracts/` into `server-dist.tar.gz`,
   and the web build into `client-dist.tar.gz`.
3. Upload both to the EC2 server (`scp -i <key> ... ubuntu@<server IP>`).
4. On the server: extract the server over `/home/ubuntu/emtees-api`, run `npm install`, replace the web files in
   `/var/www/emtees/client/dist` (served by nginx), and `pm2 restart emtees-api`.

Things to know:
- **`.env` is not uploaded.** The server keeps its own `/home/ubuntu/emtees-api/server/.env`; edit it by SSH only,
  then `pm2 restart emtees-api --update-env`.
- **`global-bundle.pem`** (RDS certificate) lives on the server in `/home/ubuntu/emtees-api/server/` and is not
  overwritten by a deploy. Keep it there.
- The SSH key path (`-i`) and the server IP are set in `deploy.sh` — edit them for your machine. The server IP
  changes if the EC2 instance is stopped and started (assign an Elastic IP to stop this).
- Database migrations in `server/db/apply-migrations.ts` run automatically every time the API starts.

## 2. Verify after deploying

```bash
ssh -i <key> ubuntu@<server IP> "pm2 list; pm2 logs emtees-api --lines 30 --nostream"
```
You should see `Server is running and ready on http://localhost:3000`. Then open https://gecouncil.com.

## 3. Useful PM2 commands (on the server)

- **View Logs:** Check real-time logs for errors or startup issues.
  ```bash
  pm2 logs emtees-api --lines 50
  ```
- **Process Status:** Check CPU and Memory usage of the API.
  ```bash
  pm2 list
  ```
- **Stop Server:**
  ```bash
  pm2 stop emtees-api
  ```
- **Save Configuration:** Run this if you change the startup script or add new environment variables so they persist across server reboots.
  ```bash
  pm2 save
  ```

## 6. Server Infrastructure

- **Node Version Manager (NVM):** Node v24.19.0 is installed via NVM.
- **Port:** The API runs locally on port `3000`.
- **Nginx:** An Nginx process is running on the server proxying requests to port `3000`.
- **Database Connection:** When `NODE_ENV=production`, the application uses `server/global-bundle.pem` (RDS CA Certificate) to authenticate securely with the database over SSL. Ensure the `global-bundle.pem` is always present in the `server/` directory.
