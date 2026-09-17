import { PrintersService } from './printers.service';
import { SetDefaultPrinterDto } from './dto/printer.dto';
export declare class AdminPrintersController {
    private readonly printersService;
    constructor(printersService: PrintersService);
    list(shopId?: string): Promise<{
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
        capabilitiesJson: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    setDefault(shopId: string, dto: SetDefaultPrinterDto): Promise<{
        id: string;
        shopId: string;
        updatedAt: Date;
        defaultPrinterId: string | null;
        retentionMinutes: number;
        maxFileSizeBytes: number;
    }>;
}
