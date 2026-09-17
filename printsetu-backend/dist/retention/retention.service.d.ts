import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { IStorageService } from '../storage/storage.interface';
import { PrintJobsRepository } from '../print/print-jobs.repository';
import { AppConfig } from '../config/configuration';
import { SystemSettingsService } from '../system-settings/system-settings.service';
export declare class RetentionService {
    private readonly prisma;
    private readonly storage;
    private readonly printJobsRepo;
    private readonly config;
    private readonly systemSettings;
    private readonly logger;
    constructor(prisma: PrismaService, storage: IStorageService, printJobsRepo: PrintJobsRepository, config: ConfigService<AppConfig, true>, systemSettings: SystemSettingsService);
    sweep(): Promise<void>;
    flagStalePrinting(): Promise<void>;
}
