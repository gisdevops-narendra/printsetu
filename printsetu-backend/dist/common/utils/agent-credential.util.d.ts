import { Printer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
export declare function verifyAgentCredential(prisma: PrismaService, raw: string | undefined): Promise<Printer | null>;
