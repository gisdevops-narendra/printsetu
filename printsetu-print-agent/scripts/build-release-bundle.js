// Assembles the shop-agnostic release bundle: the packaged exe plus the
// Task Scheduler install/uninstall scripts, all in one folder. The backend
// (printsetu-backend/src/printers) reads this folder at download time,
// drops in a per-shop agent.config.json, and zips it for the shopkeeper.
// Run `npm run build:exe` first (this script does not repackage the exe
// itself, so re-runs during development are fast).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const releaseExe = path.join(root, 'release', 'PrintSetuAgent.exe');
const bundleDir = path.join(root, 'release', 'bundle');
const serviceDir = path.join(root, 'service');

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(releaseExe)) {
  fail(`${releaseExe} not found. Run "npm run build:exe" first.`);
}

fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });

fs.copyFileSync(releaseExe, path.join(bundleDir, 'PrintSetuAgent.exe'));

for (const file of [
  'Install.bat',
  'Uninstall.bat',
  'Install-Task.ps1',
  'Uninstall-Task.ps1',
  'Check-Connection.ps1',
  'README.txt',
]) {
  fs.copyFileSync(path.join(serviceDir, file), path.join(bundleDir, file));
}

console.log(`Release bundle assembled at ${bundleDir}`);
