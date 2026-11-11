#!/usr/bin/env bash
# The runner's default resolver can fail for Ubuntu mirrors; public resolvers
# and bounded apt retries keep a transient DNS fault from failing the build.

set -euo pipefail

resolver_conf_dir=/etc/systemd/resolved.conf.d
resolver_drop_in=$resolver_conf_dir/fallback-dns.conf
apt_options=(-o Acquire::Retries=5)
attempts=3

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
  if ! sudo mkdir -p "$resolver_conf_dir"; then
    printf '%s\n' 'Warning: could not create the fallback resolver configuration directory; continuing.' >&2
  else
    trap cleanup_resolver EXIT
    if ! printf '%s\n' '[Resolve]' 'DNS=1.1.1.1 9.9.9.9' 'Domains=~.' |
      sudo tee "$resolver_drop_in" >/dev/null; then
      printf '%s\n' 'Warning: could not write the fallback resolver configuration; continuing.' >&2
    else
      if ! sudo systemctl restart systemd-resolved; then
        printf '%s\n' 'Warning: could not restart systemd-resolved with the fallback; continuing.' >&2
      fi
    fi
  fi
else
  printf '%s\n' 'Warning: systemd-resolved is not active; continuing with the current resolver.' >&2
fi

for ((attempt = 1; attempt <= attempts; attempt++)); do
  if sudo apt-get "${apt_options[@]}" update; then
    if sudo apt-get "${apt_options[@]}" install --yes "$@"; then
      exit 0
    else
      status=$?
    fi
  else
    status=$?
  fi

  if (( attempt < attempts )); then
    sleep 10
  fi
done

exit "$status"
