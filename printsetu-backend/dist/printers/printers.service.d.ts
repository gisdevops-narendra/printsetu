import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPrinterDto } from './dto/printer.dto';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
export declare class PrintersService {
    private readonly prisma;
    private readonly connections;
    private readonly logger;
    constructor(prisma: PrismaService, connections: AgentConnectionRegistry);
    register(dto: RegisterPrinterDto): Promise<{
        printerId: string;
        agentId: string;
        agentSecret: string;
        agentCredential: string;
    }>;
    heartbeat(printerId: string, capabilities?: Record<string, unknown>): Promise<void>;
    markOffline(printerId: string): Promise<void>;
    listForShop(shopId: string): Promise<{
        id: string;
        createdAt: Date;
        shopId: string;
        status: import(".prisma/client").$Enums.PrinterStatus;
        updatedAt: Date;
        agentId: string;
        agentKeyHash: string;
        printerName: string;
        driverName: string | null;
        lastHeartbeatAt: Date | null;
        capabilitiesJson: Prisma.JsonValue | null;
    }[]>;
    listAll(): Promise<{
        id: string;
        createdAt: Date;
        shopId: string;
        status: import(".prisma/client").$Enums.PrinterStatus;
        updatedAt: Date;
        agentId: string;
        agentKeyHash: string;
        printerName: string;
        driverName: string | null;
        lastHeartbeatAt: Date | null;
        capabilitiesJson: Prisma.JsonValue | null;
    }[]>;
    setDefaultForShop(shopId: string, printerId: string): Promise<{
        id: string;
        shopId: string;
        updatedAt: Date;
        defaultPrinterId: string | null;
        retentionMinutes: number;
        maxFileSizeBytes: number;
    }>;
    sweepStaleHeartbeats(): Promise<void>;
}
