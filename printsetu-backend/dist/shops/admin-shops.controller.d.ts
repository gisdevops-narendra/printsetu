import { Request } from 'express';
import { ShopsService } from './shops.service';
import { CreateShopDto, UpdatePrintSettingsDto, UpdateShopDto, UpdateShopStatusDto } from './dto/shop.dto';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/request-context';
export declare class AdminShopsController {
    private readonly shopsService;
    private readonly audit;
    constructor(shopsService: ShopsService, audit: AuditService);
    create(dto: CreateShopDto, user: AuthenticatedUser, req: Request): Promise<{
        printSettings: {
            retentionMinutes: number;
            maxFileSizeBytes: number;
            id: string;
            updatedAt: Date;
            defaultPrinterId: string | null;
            shopId: string;
        } | null;
    } & {
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        id: string;
        shopCode: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    list(page?: string, pageSize?: string): Promise<{
        items: {
            name: string;
            ownerName: string;
            mobile: string;
            email: string;
            address: string;
            city: string;
            status: import(".prisma/client").$Enums.ShopStatus;
            id: string;
            shopCode: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        id: string;
        shopCode: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, dto: UpdateShopDto, user: AuthenticatedUser, req: Request): Promise<{
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        id: string;
        shopCode: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    setStatus(id: string, dto: UpdateShopStatusDto, user: AuthenticatedUser, req: Request): Promise<{
        name: string;
        ownerName: string;
        mobile: string;
        email: string;
        address: string;
        city: string;
        status: import(".prisma/client").$Enums.ShopStatus;
        id: string;
        shopCode: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getSettings(id: string): Promise<{
        retentionMinutes: number;
        maxFileSizeBytes: number;
        id: string;
        updatedAt: Date;
        defaultPrinterId: string | null;
        shopId: string;
    }>;
    updateSettings(id: string, dto: UpdatePrintSettingsDto, user: AuthenticatedUser, req: Request): Promise<{
        retentionMinutes: number;
        maxFileSizeBytes: number;
        id: string;
        updatedAt: Date;
        defaultPrinterId: string | null;
        shopId: string;
    }>;
}
