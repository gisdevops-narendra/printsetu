import { Injectable, Logger } from '@nestjs/common';
import archiver = require('archiver');
import * as fs from 'fs';
import * as path from 'path';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';

export interface AgentPackageCredential {
  agentId: string;
  agentSecret: string;
  printerName: string;
}

/**
 * Assembles the shopkeeper-facing "Download Print Agent" ZIP: the
 * shop-agnostic packaged exe + Windows service wrapper (built ahead of time
 * by `npm run build:exe && npm run package` in printsetu-print-agent) plus a
 * freshly-written agent.config.json carrying this shop's own credential, so
 * the shopkeeper never has to open a config file by hand.
 */
@Injectable()
export class AgentPackageService {
  private readonly logger = new Logger(AgentPackageService.name);

  private bundleDir(): string {
    const configured = process.env.PRINT_AGENT_BUNDLE_DIR || '../printsetu-print-agent/release/bundle';
    return path.resolve(process.cwd(), configured);
  }

  async buildZip(credential: AgentPackageCredential): Promise<Buffer> {
    const bundleDir = this.bundleDir();
    if (!fs.existsSync(path.join(bundleDir, 'PrintSetuAgent.exe'))) {
      this.logger.error(`Print Agent bundle not found at ${bundleDir}`);
      throw new AppNotFoundException(
        'The Print Agent installer has not been built on this server yet. Please contact support.',
      );
    }

    const agentConfig = {
      agentId: credential.agentId,
      agentSecret: credential.agentSecret,
      printerName: credential.printerName,
    };

    const agentEnv = [
      `PRINTSETU_BACKEND_WS_URL=${process.env.AGENT_BACKEND_WS_URL || 'ws://localhost:53100'}`,
      `PRINTSETU_BACKEND_HTTP_URL=${process.env.AGENT_BACKEND_HTTP_URL || 'http://localhost:53100/api'}`,
      '',
    ].join('\n');

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('warning', (err) => this.logger.warn(`Archive warning: ${err.message}`));
      archive.on('error', reject);
      archive.on('end', () => resolve(Buffer.concat(chunks)));

      // Ship every static file from the pre-built bundle (exe, service
      // wrapper, XML, install/uninstall scripts, README) as-is.
      archive.directory(bundleDir, false);

      // Then add the two files that are unique to this shop/download.
      archive.append(JSON.stringify(agentConfig, null, 2), { name: 'agent.config.json' });
      archive.append(agentEnv, { name: '.env' });

      archive.finalize();
    });
  }
}
