import { PrismaService } from '../prisma/prisma.service';
export declare class QrService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private publicAppBaseUrl;
    getOrCreateActiveForShop(shopId: string): Promise<{
        id: string;
        shopId: string;
        status: import(".prisma/client").$Enums.QrStatus;
        publicCode: string;
        targetPath: string;
        generatedAt: Date;
        revokedAt: Date | null;
    }>;
    regenerate(shopId: string): Promise<{
        id: string;
        shopId: string;
        status: import(".prisma/client").$Enums.QrStatus;
        publicCode: string;
        targetPath: string;
        generatedAt: Date;
        revokedAt: Date | null;
    }>;
    private createNew;
    renderPngDataUrl(shopId: string): Promise<{
        dataUrl: string;
        url: string;
        code: string;
    }>;
    resolvePublicCode(publicCode: string): Promise<{
        shopId: string;
        shopName: string;
        city: string;
    }>;
}
