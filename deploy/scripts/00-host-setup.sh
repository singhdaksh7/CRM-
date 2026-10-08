#!/usr/bin/env bash
# ONE-TIME root setup for the VPS. Run as:  sudo bash 00-host-setup.sh
# Idempotent. Never touches Traefik, Docker, DNS or any data.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

# 1. Workspace owned by the deploy user
install -d -o deploy -g deploy -m 755 /opt/kp-crm
install -d -o deploy -g deploy -m 755 /opt/kp-crm/repo /opt/kp-crm/scripts
install -d -o deploy -g deploy -m 700 /opt/kp-crm/env /opt/kp-crm/backups

# 2. 2 GiB persistent swap, low swappiness
if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048; }
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-kp-swap.conf
sysctl -q -p /etc/sysctl.d/99-kp-swap.conf

# 3. Firewall: make sure SSH/HTTP/HTTPS are allowed (ufw is already active); no lockout
ufw allow 22/tcp  >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw status | grep -q 'Status: active' || ufw --force enable >/dev/null

# 4. SSH hardening that cannot lock out key auth (validated before reload)
cat > /etc/ssh/sshd_config.d/99-kp-hardening.conf <<'CONF'
PermitRootLogin prohibit-password
X11Forwarding no
PasswordAuthentication no
MaxAuthTries 4
CONF
sshd -t && systemctl reload ssh

# 5. Passwordless sudo is NOT granted. Report state only.
echo "--- swap";  swapon --show
echo "--- ufw";   ufw status | head -12
echo "--- sshd";  sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|x11forwarding) '
echo "--- reboot pending: $( [ -f /var/run/reboot-required ] && echo yes || echo no )"
