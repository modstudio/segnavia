#!/usr/bin/env bash
# The runner's default resolver can fail for Ubuntu mirrors; public resolvers
# and bounded apt retries keep a transient DNS fault from failing the build.

set -euo pipefail

if systemctl is-active --quiet systemd-resolved; then
  sudo mkdir -p /etc/systemd/resolved.conf.d
  printf '%s\n' '[Resolve]' 'DNS=1.1.1.1 9.9.9.9' 'Domains=~.' |
    sudo tee /etc/systemd/resolved.conf.d/fallback-dns.conf >/dev/null
  sudo systemctl restart systemd-resolved
else
  printf '%s\n' 'Warning: systemd-resolved is not active; continuing with the current resolver.' >&2
fi

for attempt in 1 2 3; do
  if sudo apt-get -o Acquire::Retries=5 update; then
    if sudo apt-get -o Acquire::Retries=5 install --yes "$@"; then
      exit 0
    else
      status=$?
    fi
  else
    status=$?
  fi

  if (( attempt < 3 )); then
    sleep 10
  fi
done

exit "$status"
