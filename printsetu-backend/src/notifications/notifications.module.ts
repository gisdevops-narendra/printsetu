import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ShopNotificationsController } from './shop-notifications.controller';

@Global()
@Module({
  controllers: [ShopNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
