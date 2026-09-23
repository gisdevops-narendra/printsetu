import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export type PrintDriver = 'windows' | 'cups' | 'mock';

export interface AgentConfig {
  agentId: string;
  agentSecret: string;
  backendWsUrl: string;
  backendHttpUrl: string;
  printerName?: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  printDriver: PrintDriver;
  downloadDir: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'agent.config.json');

interface PersistedConfig {
  agentId?: string;
  agentSecret?: string;
  printerName?: string;
}

function readPersistedConfig(): PersistedConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writePersistedConfig(cfg: PersistedConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * Resolution order matches how a real shop PC installer would work: an
 * admin-issued credential is dropped into agent.config.json once (via
 * `npm run configure`), while connection/behavior tuning stays in the
 * environment so the same build works across shops.
 */
export function loadConfig(): AgentConfig {
  const persisted = readPersistedConfig();

  const agentId = process.env.PRINTSETU_AGENT_ID || persisted.agentId;
  const agentSecret = process.env.PRINTSETU_AGENT_SECRET || persisted.agentSecret;

  if (!agentId || !agentSecret) {
    throw new Error(
      'Missing agent credential. Run `npm run configure -- --agentId=<id> --agentSecret=<secret>` ' +
        '(values are printed once by POST /api/agent/register) or set PRINTSETU_AGENT_ID / PRINTSETU_AGENT_SECRET.',
    );
  }

  const platformDefault: PrintDriver =
    process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'cups' : 'mock';

  return {
    agentId,
    agentSecret,
    backendWsUrl: process.env.PRINTSETU_BACKEND_WS_URL || 'ws://localhost:53000',
    backendHttpUrl: process.env.PRINTSETU_BACKEND_HTTP_URL || 'http://localhost:53000/api',
    printerName: process.env.PRINTSETU_PRINTER_NAME || persisted.printerName,
    pollIntervalMs: parseInt(process.env.PRINTSETU_POLL_INTERVAL_MS || '8000', 10),
    heartbeatIntervalMs: parseInt(process.env.PRINTSETU_HEARTBEAT_INTERVAL_MS || '20000', 10),
    printDriver: (process.env.PRINTSETU_PRINT_DRIVER as PrintDriver) || platformDefault,
    downloadDir: process.env.PRINTSETU_DOWNLOAD_DIR || path.join(process.cwd(), 'downloads'),
  };
}
