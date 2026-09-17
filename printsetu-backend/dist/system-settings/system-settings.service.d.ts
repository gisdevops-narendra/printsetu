import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class SystemSettingsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(): Promise<{
        key: string;
        valueJson: Prisma.JsonValue;
        updatedAt: Date;
    }[]>;
    get<T = unknown>(key: string): Promise<T | null>;
    getOrDefault<T>(key: string, defaultValue: T): Promise<T>;
    set(key: string, value: unknown): Promise<{
        key: string;
        valueJson: Prisma.JsonValue;
        updatedAt: Date;
    }>;
}
