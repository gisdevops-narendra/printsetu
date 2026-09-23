import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeycloakTokenVerifierService } from './keycloak-token-verifier.service';
import { UsersModule } from '../users/users.module';
import { KeycloakAdminModule } from './keycloak-admin.module';
import { ShopsModule } from '../shops/shops.module';
import { RegistrationService } from './registration.service';
import { KeycloakAuthGuard } from '../common/guards/keycloak-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Global()
@Module({
  imports: [UsersModule, KeycloakAdminModule, ShopsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    KeycloakTokenVerifierService,
    { provide: APP_GUARD, useClass: KeycloakAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [KeycloakTokenVerifierService],
})
export class AuthModule {}
