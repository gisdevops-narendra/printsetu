import { PrintersService } from './printers.service';
import { PrintJobsService } from '../print/print-jobs.service';
import { RegisterPrinterDto } from './dto/printer.dto';
import { AgentJobStatusDto } from '../print/dto/print.dto';
import { AuthenticatedAgent } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { IStorageService } from '../storage/storage.interface';
export declare class AgentController {
    private readonly printersService;
    private readonly printJobsService;
    private readonly prisma;
    private readonly storage;
    constructor(printersService: PrintersService, printJobsService: PrintJobsService, prisma: PrismaService, storage: IStorageService);
    register(dto: RegisterPrinterDto): Promise<{
        printerId: string;
        agentId: string;
        agentSecret: string;
        agentCredential: string;
    }>;
    nextJob(agent: AuthenticatedAgent): Promise<{
        job: null;
    } | {
        job: {
            jobId: string;
            originalName: string;
            mimeType: string;
            options: import("@prisma/client/runtime/library").JsonValue;
            attemptId: string;
            documentSignedUrl: string;
        };
    }>;
    reportStatus(id: string, dto: AgentJobStatusDto, agent: AuthenticatedAgent): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
    }>;
    heartbeat(agent: AuthenticatedAgent): Promise<void>;
}
