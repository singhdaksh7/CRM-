#!/usr/bin/env bash
# Daily follow-up notification sweep (replaces Vercel Cron "0 3 * * *").
# CRON_SECRET is read INSIDE the container; it never appears on the host command line.
# This only creates in-app notifications - it NEVER sends WhatsApp messages.
set -euo pipefail
docker exec kp-crm node -e "
fetch('http://127.0.0.1:3000/api/internal/notifications/sweep',{method:'GET',headers:{authorization:'Bearer '+process.env.CRON_SECRET}})
 .then(r=>{console.log('sweep http',r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error('sweep failed');process.exit(1)})"
