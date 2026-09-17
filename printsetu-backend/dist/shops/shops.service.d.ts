import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto, UpdatePrintSettingsDto, UpdateShopDto } from './dto/shop.dto';
import { ShopStatus } from '@prisma/client';
export declare class ShopsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateShopDto): Promise<{
        printSettings: {
            id: string;
            updatedAt: Date;
            defaultPrinterId: string | null;
            retentionMinutes: number;
            maxFileSizeBytes: number;
            shopId: string;
        } | null;
    } & {
        id: string;
        shopCode: string;
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    list(page?: number, pageSize?: number): Promise<{
        items: {
            id: string;
            shopCode: string;
            name: string;
            ownerName: string;
            mobile: string;
            email: string;
            address: string;
            city: string;
            status: import(".prisma/client").$Enums.ShopStatus;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    findByIdOrThrow(id: string): Promise<{
        id: string;
        shopCode: string;
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, dto: UpdateShopDto): Promise<{
        id: string;
        shopCode: string;
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    setStatus(id: string, status: ShopStatus): Promise<{
        id: string;
        shopCode: string;
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getSettings(shopId: string): Promise<{
        id: string;
        updatedAt: Date;
        defaultPrinterId: string | null;
        retentionMinutes: number;
        maxFileSizeBytes: number;
        shopId: string;
    }>;
    updateSettings(shopId: string, dto: UpdatePrintSettingsDto): Promise<{
        id: string;
        updatedAt: Date;
        defaultPrinterId: string | null;
        retentionMinutes: number;
        maxFileSizeBytes: number;
        shopId: string;
    }>;
}
