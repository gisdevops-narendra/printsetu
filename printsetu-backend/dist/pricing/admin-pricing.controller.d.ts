import { PricingService } from './pricing.service';
import { SetPricingDto } from './dto/pricing.dto';
export declare class AdminPricingController {
    private readonly pricingService;
    constructor(pricingService: PricingService);
    listActive(shopId: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    listHistory(shopId: string): import(".prisma/client").Prisma.PrismaPromise<{
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
}
