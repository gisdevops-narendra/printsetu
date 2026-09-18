import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { customAlphabet } from 'nanoid';
import { Prisma, PrinterStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { generateAgentSecret, hashSecret } from '../common/utils/secret.util';
import { RegisterPrinterDto } from './dto/printer.dto';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';

const agentIdAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 20);
const HEARTBEAT_STALE_MS = 90_000;

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

  async markOffline(printerId: string) {
    await this.prisma.printer.update({
      where: { id: printerId },
      data: { status: PrinterStatus.OFFLINE },
    });
  }

  async listForShop(shopId: string) {
    return this.prisma.printer.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
  }

  async listAll() {
    return this.prisma.printer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async setDefaultForShop(shopId: string, printerId: string) {
    const printer = await this.prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer || printer.shopId !== shopId) {
      throw new AppNotFoundException('Printer not found for this shop.');
    }
    return this.prisma.printSettings.upsert({
      where: { shopId },
      update: { defaultPrinterId: printerId },
      create: { shopId, defaultPrinterId: printerId },
    });
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
