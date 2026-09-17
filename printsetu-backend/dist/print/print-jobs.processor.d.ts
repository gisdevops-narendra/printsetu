import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrintJobsService } from './print-jobs.service';
export declare class PrintJobsProcessor extends WorkerHost {
    private readonly printJobsService;
    private readonly logger;
    constructor(printJobsService: PrintJobsService);
    process(job: Job<{
        printJobId: string;
    }>): Promise<void>;
}
