import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/request-context';
export declare class ShopProfileController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    profile(user: AuthenticatedUser): Promise<{
        shop: ({
            printSettings: {
                id: string;
                shopId: string;
                updatedAt: Date;
                defaultPrinterId: string | null;
                retentionMinutes: number;
                maxFileSizeBytes: number;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            name: string;
            status: import(".prisma/client").$Enums.ShopStatus;
            email: string;
            mobile: string;
            updatedAt: Date;
            ownerName: string;
            address: string;
            city: string;
            shopCode: string;
        }) | null;
        pricing: {
            id: string;
            createdAt: Date;
            shopId: string;
            paperSize: import(".prisma/client").$Enums.PaperSize;
            colorMode: import(".prisma/client").$Enums.ColorMode;
            sideMode: import(".prisma/client").$Enums.SideMode;
            pricePerPage: import("@prisma/client/runtime/library").Decimal;
            effectiveFrom: Date;
            active: boolean;
        }[];
    }>;
}
