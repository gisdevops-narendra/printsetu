PrintSetu Print Agent for Linux — Setup
=======================================

This lets your PrintSetu shop dashboard send print jobs straight to a
printer on this computer. Works on Ubuntu, Debian, Linux Mint, Fedora and
other systemd-based distributions with CUPS (the standard Linux printing
system).

BEFORE YOU START
Make sure your printer is set up and can print a test page from this
computer (Settings > Printers on Ubuntu).

HOW TO INSTALL
1. Extract the downloaded file (right-click > Extract Here, or run
   "tar xzf PrintSetu-Print-Agent-linux.tar.gz").
2. Open a Terminal in the extracted folder and run:
       sudo sh install.sh
3. Enter your password when asked.
4. Wait a few seconds. You'll see a message telling you whether your
   shop connected successfully.
5. On your PrintSetu dashboard, open the Print Agent page and choose
   which printer to print on.

The Print Agent now starts automatically every time this computer turns
on, and restarts itself if it ever stops. It is installed in
/opt/printsetu-agent.

HOW TO UNINSTALL
Run:  sudo sh /opt/printsetu-agent/uninstall.sh

TROUBLESHOOTING
- "No printers found": check the printer shows up with the command
  "lpstat -e". If "lp" or "lpstat" is missing, install CUPS with
  "sudo apt install cups cups-client".
- Service status:  systemctl status printsetu-agent
- Logs:            /opt/printsetu-agent/logs/agent.log
- This agent is tied to one shop and one credential. For a new PC,
  download it again from your PrintSetu dashboard rather than copying
  this folder.
