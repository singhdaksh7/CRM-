#!/usr/bin/env bash
# SSH forced-command wrapper for the CI deploy key. In ~deploy/.ssh/authorized_keys:
#   command="/opt/kp-crm/repo/deploy/scripts/ssh-entry.sh",restrict ssh-ed25519 AAAA... github-actions-kp-crm
# The key can then do exactly one thing: run a release of a 40-hex SHA. No shell, no forwarding.
set -euo pipefail
cmd=${SSH_ORIGINAL_COMMAND:-}
if [[ "$cmd" =~ ^release\ ([0-9a-f]{40})((\ --dry-run)?(\ --allow-reviewed-migration)?)$ ]]; then
  # shellcheck disable=SC2086
  exec /opt/kp-crm/repo/deploy/scripts/release.sh "${BASH_REMATCH[1]}" ${BASH_REMATCH[2]}
fi
echo "denied: only 'release <sha> [--dry-run] [--allow-reviewed-migration]' is permitted" >&2; exit 126
