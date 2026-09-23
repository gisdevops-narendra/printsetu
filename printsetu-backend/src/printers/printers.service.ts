import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { customAlphabet } from 'nanoid';
import { Prisma, PrinterStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
} from '../common/exceptions/app.exceptions';
import { generateAgentSecret, hashSecret } from '../common/utils/secret.util';
import { RegisterPrinterDto, ReportPrintersDto } from './dto/printer.dto';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';

const agentIdAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 20);
const HEARTBEAT_STALE_MS = 90_000;

/** Shape of Printer.capabilitiesJson, as last reported by the agent. */
export interface AgentCapabilities {
  printers: { name: string; isDefault: boolean }[];
  platform?: string;
  hostname?: string;
  reportedAt: string;
}

@Injectable()
export class PrintersService {
  private readonly logger = new Logger(PrintersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: AgentConnectionRegistry,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  /** SRS §17: POST /api/agent/register — "One-time provisioning/admin-controlled". */
  async register(dto: RegisterPrinterDto) {
    await this.subscriptionAccess.assertPrinterQuota(dto.shopId);
    const agentId = agentIdAlphabet();
    const agentSecret = generateAgentSecret();
    const printer = await this.prisma.printer.create({
      data: {
        shopId: dto.shopId,
        agentId,
        agentKeyHash: hashSecret(agentSecret),
        printerName: dto.printerName,
        driverName: dto.driverName,
        status: PrinterStatus.UNKNOWN,
      },
    });
    // agentSecret is returned exactly once — only the hash is ever persisted.
    return {
      printerId: printer.id,
      agentId: printer.agentId,
      agentSecret,
      agentCredential: `${printer.agentId}.${agentSecret}`,
    };
  }

  async heartbeat(printerId: string, capabilities?: Record<string, unknown>) {
    await this.prisma.printer.update({
      where: { id: printerId },
      data: {
        status: PrinterStatus.ONLINE,
        lastHeartbeatAt: new Date(),
        ...(capabilities ? { capabilitiesJson: capabilities as Prisma.InputJsonValue } : {}),
      },
    });
  }

  /** Stores the OS printers an agent just detected on its computer, for the shopkeeper's printer picker. */
  async reportPrinters(printerId: string, dto: ReportPrintersDto) {
    const capabilities: AgentCapabilities = {
      printers: dto.printers.map(({ name, isDefault }) => ({ name, isDefault })),
      platform: dto.platform,
      hostname: dto.hostname,
      reportedAt: new Date().toISOString(),
    };
    await this.prisma.printer.update({
      where: { id: printerId },
      data: { capabilitiesJson: capabilities as unknown as Prisma.InputJsonValue },
    });
    return { received: capabilities.printers.length };
  }

  /**
   * Chooses which OS printer on the agent's computer jobs go to (null = that
   * computer's default printer). Only names the agent has actually reported
   * are accepted, so a typo can't silently route every job into a failure.
   */
  async selectOsPrinter(shopId: string, printerId: string, osPrinterName: string | null) {
    const printer = await this.findShopPrinter(shopId, printerId);
    if (osPrinterName !== null) {
      const reported =
        (printer.capabilitiesJson as unknown as AgentCapabilities | null)?.printers ?? [];
      if (!reported.some((p) => p.name === osPrinterName)) {
        throw new InvalidPrintOptionException(
          `"${osPrinterName}" is not one of the printers this Print Agent reported. Refresh the printer list and try again.`,
        );
      }
    }
    return this.prisma.printer.update({ where: { id: printerId }, data: { osPrinterName } });
  }

  /** Asks the agent to re-scan its printers now; the new list arrives via POST /agent/printers moments later. */
  async requestPrinterRefresh(shopId: string, printerId: string) {
    await this.findShopPrinter(shopId, printerId);
    return { requested: this.connections.requestPrinterRefresh(printerId) };
  }

  private async findShopPrinter(shopId: string, printerId: string) {
    const printer = await this.prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer || printer.shopId !== shopId || printer.status === PrinterStatus.REMOVED) {
      throw new AppNotFoundException('Printer not found for this shop.');
    }
    return printer;
  }

  async markOffline(printerId: string) {
    await this.prisma.printer.update({
      where: { id: printerId },
      data: { status: PrinterStatus.OFFLINE },
    });
  }

  /** Removed (unlinked) printers stay in the DB for PrintJob history but are never shown as live/selectable. */
  async listForShop(shopId: string) {
    return this.prisma.printer.findMany({
      where: { shopId, status: { not: PrinterStatus.REMOVED } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listAll() {
    return this.prisma.printer.findMany({
      where: { status: { not: PrinterStatus.REMOVED } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setDefaultForShop(shopId: string, printerId: string) {
    await this.findShopPrinter(shopId, printerId);
    return this.prisma.printSettings.upsert({
      where: { shopId },
      update: { defaultPrinterId: printerId },
      create: { shopId, defaultPrinterId: printerId },
    });
  }

  /**
   * Unlinks/disconnects a printer: kicks any live agent socket, blocks that
   * agent credential from authenticating again (verifyAgentCredential
   * checks status), clears it as the shop's default if it was one, and
   * marks it REMOVED — a soft delete, since PrintJob.printerId has a real
   * FK to this row and historical jobs must keep resolving. `shopId`, when
   * given, scopes this to a shopkeeper removing only their own printer.
   */
  async remove(printerId: string, shopId?: string): Promise<void> {
    const printer = await this.prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer || (shopId && printer.shopId !== shopId)) {
      throw new AppNotFoundException('Printer not found for this shop.');
    }
    if (printer.status === PrinterStatus.REMOVED) return;

    this.connections.disconnect(printerId);

    await this.prisma.$transaction([
      this.prisma.printer.update({
        where: { id: printerId },
        data: { status: PrinterStatus.REMOVED },
      }),
      this.prisma.printSettings.updateMany({
        where: { shopId: printer.shopId, defaultPrinterId: printerId },
        data: { defaultPrinterId: null },
      }),
    ]);
  }

  /** SRS §13.3 "Agent stopped" -> heartbeat goes stale -> visible OFFLINE status. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweepStaleHeartbeats() {
    const staleBefore = new Date(Date.now() - HEARTBEAT_STALE_MS);
    const result = await this.prisma.printer.updateMany({
      where: {
        status: PrinterStatus.ONLINE,
        OR: [{ lastHeartbeatAt: { lt: staleBefore } }, { lastHeartbeatAt: null }],
      },
      data: { status: PrinterStatus.OFFLINE },
    });
    if (result.count > 0) {
      this.logger.warn(`Marked ${result.count} printer(s) OFFLINE due to stale heartbeat.`);
    }
  }
}
