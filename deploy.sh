#!/bin/bash
set -e

# Target server and SSH key. Defaults to the domain (so after a server move it needs no edit).
# Override for a specific machine:  EMTEES_HOST=52.66.45.63 ./deploy.sh
HOST="${EMTEES_HOST:-gecouncil.com}"
KEY="${EMTEES_KEY:-$HOME/Projects/Emtees/emtees.pem}"
SSH_OPTS="-i $KEY -o StrictHostKeyChecking=accept-new"

echo "=== Building server ==="
npm run build --workspace=server

echo "=== Building client ==="
npm run build --workspace=client

echo "=== Packaging server (src + db + contracts + config) ==="
rm -f server-dist.tar.gz
tar -czf server-dist.tar.gz \
  server/src/ \
  server/db/ \
  server/dist/ \
  server/package.json \
  server/tsconfig.json \
  contracts/

echo "=== Packaging client ==="
rm -f client-dist.tar.gz
tar -czf client-dist.tar.gz client/dist/

echo "=== Uploading to AWS ==="
scp $SSH_OPTS server-dist.tar.gz ubuntu@$HOST:~
scp $SSH_OPTS client-dist.tar.gz ubuntu@$HOST:~

echo "=== Deploying on AWS ==="
ssh $SSH_OPTS ubuntu@$HOST << 'REMOTE'
  # Load Node/pm2 when they come from nvm (non-interactive shells skip .bashrc)
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

  # Extract server (preserve existing node_modules)
  cd /home/ubuntu/emtees-api
  tar -xzf ~/server-dist.tar.gz

  # Install deps natively on Linux (do NOT copy macOS node_modules)
  cd /home/ubuntu/emtees-api/server
  npm install

  # Extract client to nginx root
  sudo rm -rf /var/www/emtees/client/dist
  sudo mkdir -p /var/www/emtees/client/
  tar -xzf ~/client-dist.tar.gz -C /tmp/
  sudo cp -r /tmp/client/dist /var/www/emtees/client/dist
  sudo chown -R www-data:www-data /var/www/emtees/client/dist
  rm -rf /tmp/client

  # Restart server (first deploy on a new machine: start it)
  pm2 restart emtees-api --update-env || (cd /home/ubuntu/emtees-api/server && pm2 start npm --name emtees-api -- run dev)
  pm2 save
REMOTE

echo "=== Deploy complete! ($HOST) ==="
