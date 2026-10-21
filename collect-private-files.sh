#!/usr/bin/env bash
# Gathers the files that are NOT on GitHub (secrets / keys) into ./handover-private
# and zips them into ./handover-private.zip so you can send them to a colleague.
# Both the folder and the zip are listed in .gitignore, so they can never be committed.
#
# Run from the Emtees repo root:   ./collect-private-files.sh
set -euo pipefail
cd "$(dirname "$0")"

OUT=handover-private
rm -rf "$OUT" "$OUT.zip"
mkdir -p "$OUT/server" "$OUT/server-access"

cp server/.env "$OUT/server/.env"
cp emtees.pem "$OUT/server-access/emtees.pem"

# Public AWS RDS CA bundle (needed for the production database SSL connection)
curl -fsS -m 60 -o "$OUT/server/global-bundle.pem" https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

cat > "$OUT/README-PRIVATE.txt" <<'EOF'
EMTEES - PRIVATE FILES (do NOT commit, do NOT post publicly)
==============================================================
Copy each file to the matching place INSIDE the cloned Emtees repo:

  server/.env                  ->  <repo>/server/.env
      All backend secrets (database URL, Razorpay, SMTP, Jitsi, app secret).
      This points at the PRODUCTION database. For local work, change DATABASE_URL
      to your own local PostgreSQL (see HANDOVER.md, section "Run locally").

  server/global-bundle.pem     ->  <repo>/server/global-bundle.pem
      Public AWS RDS certificate. Only needed when connecting to the AWS database.

  server-access/emtees.pem     ->  keep somewhere safe, e.g. C:\Users\<you>\.ssh\emtees.pem
      SSH key for the production server (ubuntu@gecouncil.com (52.66.45.63)). Anyone with this
      file can log in to the live server. Share it only if needed, and delete it
      after the handover.

Test logins on the live system (created for testing; remove when done):
  teacher: test_teacher / Test@1234
  student: test_student / Test@1234

After handing over, rotate: database password, APP_SECRET, SMTP password,
Razorpay secret, Jitsi secret, and replace the SSH key.
EOF

zip -qr "$OUT.zip" "$OUT"
echo "Done."
echo "Folder: $(pwd)/$OUT"
echo "Zip   : $(pwd)/$OUT.zip   <- send this one"
