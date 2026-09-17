import { RoleName } from '@prisma/client';
export declare class CreateUserDto {
    name: string;
    email: string;
    mobile?: string;
    role: RoleName;
    shopId?: string;
}
export declare class UpdateUserStatusDto {
    status: 'ACTIVE' | 'DISABLED';
}
