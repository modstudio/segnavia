#!/usr/bin/env bash
# The runner's default resolver can fail for Ubuntu mirrors; public resolvers
# and bounded apt retries keep a transient DNS fault from failing the build.

set -euo pipefail

resolver_drop_in=/etc/systemd/resolved.conf.d/fallback-dns.conf

# shellcheck disable=SC2329 # Invoked indirectly by the EXIT trap.
cleanup_resolver() {
  local status=$?

  if ! sudo rm -f "$resolver_drop_in"; then
    printf '%s\n' 'Warning: could not remove the fallback resolver configuration.' >&2
  fi
  if ! sudo systemctl restart systemd-resolved; then
    printf '%s\n' 'Warning: could not restart systemd-resolved after removing the fallback.' >&2
  fi

  return "$status"
}

if systemctl is-active --quiet systemd-resolved; then
  if ! sudo mkdir -p /etc/systemd/resolved.conf.d; then
    printf '%s\n' 'Warning: could not create the fallback resolver configuration directory; continuing.' >&2
  elif ! printf '%s\n' '[Resolve]' 'DNS=1.1.1.1 9.9.9.9' 'Domains=~.' |
    sudo tee "$resolver_drop_in" >/dev/null; then
    printf '%s\n' 'Warning: could not write the fallback resolver configuration; continuing.' >&2
  else
    trap cleanup_resolver EXIT
    if ! sudo systemctl restart systemd-resolved; then
      printf '%s\n' 'Warning: could not restart systemd-resolved with the fallback; continuing.' >&2
    fi
  fi
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
