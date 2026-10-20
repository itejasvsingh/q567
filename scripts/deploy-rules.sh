#!/bin/bash
# Deploys database.rules.json with the admin PIN filled in from .secrets/admin-pin
# (that file is git-ignored; the repo is public so the PIN must never be committed).
set -e
cd "$(dirname "$0")/.."
PIN=$(cat .secrets/admin-pin)
D=$(mktemp -d)
sed "s/__ADMIN_PIN__/$PIN/g" database.rules.json > "$D/database.rules.json"
echo '{"database":{"rules":"database.rules.json"}}' > "$D/firebase.json"
cd "$D" && firebase deploy --only database --project q567mba
