import { Injectable, Logger } from '@nestjs/common';
import archiver = require('archiver');
import * as fs from 'fs';
import * as path from 'path';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { AgentPackageOs } from './dto/printer.dto';

export interface AgentPackageCredential {
  agentId: string;
  agentSecret: string;
}

export interface AgentPackage {
  data: Buffer;
  fileName: string;
  contentType: string;
}

interface BundleSpec {
  /** Where the pre-built bundle lives (env overrides first, then the dev-checkout default). */
  resolveDir: () => string | undefined;
  defaultDir: string;
  /** File that must exist for the bundle to count as built. */
  binary: string;
  /** Files that must be executable once extracted (tar keeps Unix modes; zip doesn't need them). */
  executables: string[];
  format: 'zip' | 'tar';
  fileName: string;
  contentType: string;
}

const BUNDLES: Record<AgentPackageOs, BundleSpec> = {
  windows: {
    resolveDir: () => process.env.PRINT_AGENT_BUNDLE_DIR,
    defaultDir: '../printsetu-print-agent/release/bundle',
    binary: 'PrintSetuAgent.exe',
    executables: [],
    format: 'zip',
    fileName: 'PrintSetu-Print-Agent.zip',
    contentType: 'application/zip',
  },
  linux: {
    // Defaults to "<Windows bundle dir>-linux", matching both the release/
    // layout and docker-compose.prod.yml's mounts, so existing deployments
    // only configure PRINT_AGENT_BUNDLE_DIR.
    resolveDir: () =>
      process.env.PRINT_AGENT_LINUX_BUNDLE_DIR ||
      (process.env.PRINT_AGENT_BUNDLE_DIR
        ? `${process.env.PRINT_AGENT_BUNDLE_DIR.replace(/\/+$/, '')}-linux`
        : undefined),
    defaultDir: '../printsetu-print-agent/release/bundle-linux',
    binary: 'printsetu-agent',
    executables: ['printsetu-agent', 'install.sh', 'uninstall.sh'],
    format: 'tar',
    fileName: 'PrintSetu-Print-Agent-linux.tar.gz',
    contentType: 'application/gzip',
  },
};

/**
 * Assembles the shopkeeper-facing "Download Print Agent" archive: the
 * shop-agnostic packaged agent + that OS's service installer (built ahead
 * of time by `npm run build:exe:all && npm run package` in
 * printsetu-print-agent) plus a freshly-written agent.config.json carrying
 * this shop's own credential, so the shopkeeper never has to open a config
 * file by hand.
 */
@Injectable()
export class AgentPackageService {
  private readonly logger = new Logger(AgentPackageService.name);

  private bundleDir(spec: BundleSpec): string {
    return path.resolve(process.cwd(), spec.resolveDir() || spec.defaultDir);
  }

  assertBundleAvailable(os: AgentPackageOs): void {
    const spec = BUNDLES[os];
    const bundleDir = this.bundleDir(spec);
    if (!fs.existsSync(path.join(bundleDir, spec.binary))) {
      this.logger.error(`Print Agent ${os} bundle not found at ${bundleDir}`);
      throw new AppNotFoundException(
        `The ${os === 'linux' ? 'Linux' : 'Windows'} Print Agent installer has not been built on this server yet. Please contact support.`,
      );
    }
  }

  async buildPackage(
    os: AgentPackageOs,
    credential: AgentPackageCredential,
  ): Promise<AgentPackage> {
    this.assertBundleAvailable(os);
    const spec = BUNDLES[os];
    const bundleDir = this.bundleDir(spec);

    // No printerName here on purpose: which OS printer to use is chosen on
    // the dashboard after install (Printer.osPrinterName) and sent with each
    // job. Older packages wrote the dashboard label ("Print Agent") in this
    // field, which the agent then mistook for a real OS printer name.
    const agentConfig = {
      agentId: credential.agentId,
      agentSecret: credential.agentSecret,
    };

    const agentEnv = [
      `PRINTSETU_BACKEND_WS_URL=${process.env.AGENT_BACKEND_WS_URL || 'ws://localhost:53100'}`,
      `PRINTSETU_BACKEND_HTTP_URL=${process.env.AGENT_BACKEND_HTTP_URL || 'http://localhost:53100/api'}`,
      '',
    ].join('\n');

    const data = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive =
        spec.format === 'zip'
          ? archiver('zip', { zlib: { level: 9 } })
          : archiver('tar', { gzip: true, gzipOptions: { level: 9 } });

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('warning', (err) => this.logger.warn(`Archive warning: ${err.message}`));
      archive.on('error', reject);
      archive.on('end', () => resolve(Buffer.concat(chunks)));

      // Ship every static file from the pre-built bundle (binary, service
      // wrapper, install/uninstall scripts, README) as-is — under a
      // top-level folder for tar, since Linux users extract in place.
      const prefix = spec.format === 'tar' ? 'PrintSetu-Print-Agent/' : '';
      archive.directory(bundleDir, prefix || false, (entry) => {
        if (spec.format === 'tar') {
          entry.mode = spec.executables.includes(path.basename(entry.name)) ? 0o755 : 0o644;
        }
        return entry;
      });

      // Then add the two files that are unique to this shop/download.
      archive.append(JSON.stringify(agentConfig, null, 2), {
        name: `${prefix}agent.config.json`,
        mode: 0o600,
      });
      archive.append(agentEnv, { name: `${prefix}.env`, mode: 0o600 });

      archive.finalize();
    });

    return { data, fileName: spec.fileName, contentType: spec.contentType };
  }
}
