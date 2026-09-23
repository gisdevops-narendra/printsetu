#!/bin/sh
# Removes the PrintSetu Print Agent service and its files from this computer.
set -eu

SERVICE=printsetu-agent
SERVICE_USER=printsetu-agent
DEST=/opt/printsetu-agent

if [ "$(id -u)" -ne 0 ]; then
  exec sudo sh "$0" "$@"
fi

systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
rm -f "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
rm -rf "$DEST"
if id "$SERVICE_USER" >/dev/null 2>&1; then
  userdel "$SERVICE_USER" >/dev/null 2>&1 || true
fi

echo "PrintSetu Print Agent removed from this computer."
