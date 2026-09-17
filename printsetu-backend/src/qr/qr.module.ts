import { Module } from '@nestjs/common';
import { QrService } from './qr.service';
import { AdminQrController } from './admin-qr.controller';
import { PublicShopController } from './public-shop.controller';

@Module({
  controllers: [AdminQrController, PublicShopController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
