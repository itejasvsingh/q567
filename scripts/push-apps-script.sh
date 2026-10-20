#!/bin/bash
# Pushes scripts/sync-apps-script.gs (as Code.gs) and scripts/notify.gs to the
# MBA Timetable Sync Apps Script project with clasp. One-time setup lives in
# ~/q567-apps-script (clasp login + clasp clone <script id>).
set -e
cd "$(dirname "$0")"
DEST="$HOME/q567-apps-script"
cp sync-apps-script.gs "$DEST/Code.js"
cp notify.gs "$DEST/notify.js"
cd "$DEST" && clasp push --force
