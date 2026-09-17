import { RoleName } from '@prisma/client';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: RoleName[]) => import("@nestjs/common").CustomDecorator<string>;
