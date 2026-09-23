#!/bin/sh
# Installs the PrintSetu Print Agent as a systemd service: starts at boot,
# restarts itself if it ever exits, and prints through CUPS (lp/lpstat).
# Linux counterpart of the Windows Install.bat / Install-Task.ps1.
set -eu

SERVICE=printsetu-agent
SERVICE_USER=printsetu-agent
DEST=/opt/printsetu-agent
UNIT="/etc/systemd/system/$SERVICE.service"
SRC="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "This needs administrator rights to set up a background service."
  echo "You may be asked for your password next."
  exec sudo sh "$0" "$@"
fi

echo "=================================================="
echo "  Installing the PrintSetu Print Agent"
echo "=================================================="
echo

if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: this computer does not use systemd, which the installer needs." >&2
  echo "Please contact PrintSetu support." >&2
  exit 1
fi

if ! command -v lp >/dev/null 2>&1 || ! command -v lpstat >/dev/null 2>&1; then
  echo "WARNING: the CUPS printing tools (lp, lpstat) are not installed, so the"
  echo "agent will not be able to find or use your printer. Install them with:"
  echo "    sudo apt install cups cups-client"
  echo
fi

# Re-running the installer (e.g. after a fresh download) replaces the old
# copy in place instead of leaving two agents running side by side.
systemctl stop "$SERVICE" >/dev/null 2>&1 || true

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir "$DEST" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

mkdir -p "$DEST/logs"
install -m 0755 "$SRC/printsetu-agent" "$DEST/printsetu-agent"
install -m 0755 "$SRC/uninstall.sh" "$DEST/uninstall.sh"
install -m 0644 "$SRC/README.txt" "$DEST/README.txt"
# Holds this shop's agent credential — readable by the service user only.
install -m 0600 "$SRC/agent.config.json" "$DEST/agent.config.json"
install -m 0600 "$SRC/.env" "$DEST/.env"
# A fresh log, so the connection check below can't match an old run's line.
rm -f "$DEST/logs/agent.log"
chown -R "$SERVICE_USER:$SERVICE_USER" "$DEST"

cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=PrintSetu Print Agent
Wants=network-online.target
After=network-online.target cups.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$DEST
ExecStart=$DEST/printsetu-agent
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT_EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE" >/dev/null 2>&1
echo "PrintSetu Print Agent service installed and started."

echo
echo "Checking your connection to PrintSetu (this can take up to 20 seconds)..."
i=0
connected=0
while [ "$i" -lt 20 ]; do
  if grep -q 'Connected to PrintSetu backend' "$DEST/logs/agent.log" 2>/dev/null; then
    connected=1
    break
  fi
  sleep 1
  i=$((i + 1))
done

echo
if [ "$connected" -eq 1 ]; then
  echo "SUCCESS -- your shop is now connected to PrintSetu!"
  echo "Open the Print Agent page on your PrintSetu dashboard to choose which printer to use."
else
  echo "The Print Agent is installed and running, but hasn't confirmed the connection yet."
  echo "Check your PrintSetu dashboard in a minute -- if it still doesn't show Online,"
  echo "check your internet connection or run:  sudo journalctl -u $SERVICE -n 50"
fi
