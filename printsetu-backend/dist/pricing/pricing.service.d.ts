import { ColorMode, PaperSize, SideMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SetPricingDto } from './dto/pricing.dto';
export declare class PricingService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listActiveForShop(shopId: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        shopId: string;
        paperSize: import(".prisma/client").$Enums.PaperSize;
        colorMode: import(".prisma/client").$Enums.ColorMode;
        sideMode: import(".prisma/client").$Enums.SideMode;
        pricePerPage: import("@prisma/client/runtime/library").Decimal;
        effectiveFrom: Date;
        active: boolean;
    }[]>;
    listHistoryForShop(shopId: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        shopId: string;
        paperSize: import(".prisma/client").$Enums.PaperSize;
        colorMode: import(".prisma/client").$Enums.ColorMode;
        sideMode: import(".prisma/client").$Enums.SideMode;
        pricePerPage: import("@prisma/client/runtime/library").Decimal;
        effectiveFrom: Date;
        active: boolean;
    }[]>;
    setRate(shopId: string, dto: SetPricingDto): Promise<{
        id: string;
        createdAt: Date;
        shopId: string;
        paperSize: import(".prisma/client").$Enums.PaperSize;
        colorMode: import(".prisma/client").$Enums.ColorMode;
        sideMode: import(".prisma/client").$Enums.SideMode;
        pricePerPage: import("@prisma/client/runtime/library").Decimal;
        effectiveFrom: Date;
        active: boolean;
    }>;
    getActiveRateOrThrow(shopId: string, paperSize: PaperSize, colorMode: ColorMode, sideMode: SideMode): Promise<{
        id: string;
        createdAt: Date;
        shopId: string;
        paperSize: import(".prisma/client").$Enums.PaperSize;
        colorMode: import(".prisma/client").$Enums.ColorMode;
        sideMode: import(".prisma/client").$Enums.SideMode;
        pricePerPage: import("@prisma/client/runtime/library").Decimal;
        effectiveFrom: Date;
        active: boolean;
    }>;
}
