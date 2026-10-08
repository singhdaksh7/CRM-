#!/usr/bin/env bash
# Install deploy-user cron jobs (UTC): nightly backup 02:00, notification sweep 03:00.
set -euo pipefail
S=/opt/kp-crm/scripts
mkdir -p /opt/kp-crm/backups/logs
cp -p /opt/kp-crm/repo/deploy/scripts/{backup,sweep}.sh "$S/"
tmp=$(mktemp)
crontab -l 2>/dev/null | grep -v '# kp-crm' > "$tmp" || true
cat >> "$tmp" <<CRON
0 2 * * * $S/backup.sh >> /opt/kp-crm/backups/logs/backup.log 2>&1 # kp-crm
0 3 * * * $S/sweep.sh >> /opt/kp-crm/backups/logs/sweep.log 2>&1 # kp-crm
CRON
crontab "$tmp"; rm -f "$tmp"; crontab -l | grep kp-crm
