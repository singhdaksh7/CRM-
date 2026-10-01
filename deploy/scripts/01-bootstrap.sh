#!/usr/bin/env bash
# Non-root: create the external proxy network the CRM shares with host-mode Traefik.
set -euo pipefail
docker network inspect kp-proxy >/dev/null 2>&1 || docker network create --driver bridge kp-proxy
docker network ls --filter name=kp-proxy
