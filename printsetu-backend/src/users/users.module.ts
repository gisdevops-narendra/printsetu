import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { MeController } from './me.controller';
import { KeycloakAdminModule } from '../auth/keycloak-admin.module';

@Module({
  imports: [KeycloakAdminModule],
  controllers: [AdminUsersController, MeController],
  providers: [UsersService, AdminUsersService],
  exports: [UsersService],
})
export class UsersModule {}
