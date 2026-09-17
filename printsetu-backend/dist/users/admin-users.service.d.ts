import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { CreateUserDto } from './dto/admin-user.dto';
import { UserStatus } from '@prisma/client';
export declare class AdminUsersService {
    private readonly prisma;
    private readonly keycloakAdmin;
    constructor(prisma: PrismaService, keycloakAdmin: KeycloakAdminService);
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
    create(dto: CreateUserDto): Promise<{
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
    setStatus(id: string, status: UserStatus): Promise<{
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
