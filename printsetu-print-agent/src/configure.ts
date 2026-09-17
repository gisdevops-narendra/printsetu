import { writePersistedConfig } from './config';

/**
 * One-time setup helper run on the shop PC after an admin has called
 * POST /api/agent/register (SRS §17: "One-time provisioning/admin-
 * controlled") and handed the shop the resulting agentId/agentSecret
 * out-of-band. Usage:
 *   npm run configure -- --agentId=abc123 --agentSecret=xyz --printerName="HP LaserJet"
 */
function parseArgs(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

const args = parseArgs();
if (!args.agentId || !args.agentSecret) {
  console.error('Usage: npm run configure -- --agentId=<id> --agentSecret=<secret> [--printerName="HP LaserJet"]');
  process.exit(1);
}

writePersistedConfig({
  agentId: args.agentId,
  agentSecret: args.agentSecret,
  printerName: args.printerName,
});

console.log('Saved agent.config.json. You can now run: npm run start');
