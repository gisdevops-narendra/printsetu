import { Request } from 'express';
import { AdminUsersService } from './admin-users.service';
import { CreateUserDto, UpdateUserStatusDto } from './dto/admin-user.dto';
import { AuthenticatedUser } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';
export declare class AdminUsersController {
    private readonly adminUsersService;
    private readonly audit;
    constructor(adminUsersService: AdminUsersService, audit: AuditService);
    list(shopId?: string): Promise<({
        shop: {
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
        } | null;
        role: {
            id: string;
            name: import(".prisma/client").$Enums.RoleName;
            description: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        shopId: string | null;
        name: string;
        status: import(".prisma/client").$Enums.UserStatus;
        email: string;
        keycloakUserId: string | null;
        roleId: string;
        mobile: string | null;
        passwordHash: string | null;
        lastLoginAt: Date | null;
        updatedAt: Date;
    })[]>;
    create(dto: CreateUserDto, actor: AuthenticatedUser, req: Request): Promise<{
        temporaryPassword: string;
        id: string;
        createdAt: Date;
        shopId: string | null;
        name: string;
        status: import(".prisma/client").$Enums.UserStatus;
        email: string;
        keycloakUserId: string | null;
        roleId: string;
        mobile: string | null;
        passwordHash: string | null;
        lastLoginAt: Date | null;
        updatedAt: Date;
    }>;
    setStatus(id: string, dto: UpdateUserStatusDto, actor: AuthenticatedUser, req: Request): Promise<{
        id: string;
        createdAt: Date;
        shopId: string | null;
        name: string;
        status: import(".prisma/client").$Enums.UserStatus;
        email: string;
        keycloakUserId: string | null;
        roleId: string;
        mobile: string | null;
        passwordHash: string | null;
        lastLoginAt: Date | null;
        updatedAt: Date;
    }>;
}
