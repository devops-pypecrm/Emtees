#!/bin/bash
echo "Building server..."
npm run build --workspace=server

echo "Packaging server..."
rm -f server-dist.tar.gz
tar -czf server-dist.tar.gz server/dist/ server/src/ server/package.json server/tsconfig.json server/.env server/global-bundle.pem server/db/ contracts/

echo "Uploading to AWS..."
scp -i ~/Downloads/emtees.pem -o StrictHostKeyChecking=no server-dist.tar.gz ubuntu@13.235.19.185:~

echo "Extracting and restarting on AWS..."
ssh -i ~/Downloads/emtees.pem -o StrictHostKeyChecking=no ubuntu@13.235.19.185 << 'REMOTE'
  rm -rf /home/ubuntu/emtees-api/server
  mkdir -p /home/ubuntu/emtees-api/server
  tar -xzf server-dist.tar.gz -C /home/ubuntu/emtees-api/
  
  cd /home/ubuntu/emtees-api/server
  rm -rf package-lock.json node_modules
  npm install
  pm2 delete emtees-api || true
  pm2 start npm --name "emtees-api" -- run dev
REMOTE
echo "Done!"
