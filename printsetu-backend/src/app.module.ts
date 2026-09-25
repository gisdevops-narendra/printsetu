import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import configuration, { AppConfig } from './config/configuration';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AgentConnectionModule } from './agent-connection/agent-connection.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ShopsModule } from './shops/shops.module';
import { PricingModule } from './pricing/pricing.module';
import { QrModule } from './qr/qr.module';
import { DocumentsModule } from './documents/documents.module';
import { PrintModule } from './print/print.module';
import { PrintersModule } from './printers/printers.module';
import { RetentionModule } from './retention/retention.module';
import { ReportsModule } from './reports/reports.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { BusinessMapModule } from './business-map/business-map.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const security = config.get('security', { infer: true });
        return [{ ttl: security.rateLimitTtlSeconds * 1000, limit: security.rateLimitMax }];
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: {
          host: config.get('redis', { infer: true }).host,
          port: config.get('redis', { infer: true }).port,
        },
      }),
    }),
    CryptoModule,
    PrismaModule,
    AuditModule,
    MailModule,
    NotificationsModule,
    AgentConnectionModule,
    AuthModule,
    UsersModule,
    ShopsModule,
    PricingModule,
    QrModule,
    DocumentsModule,
    PrintModule,
    PrintersModule,
    RetentionModule,
    ReportsModule,
    SystemSettingsModule,
    SubscriptionsModule,
    BusinessMapModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
