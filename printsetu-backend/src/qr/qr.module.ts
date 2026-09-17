import { Module } from '@nestjs/common';
import { QrService } from './qr.service';
import { AdminQrController } from './admin-qr.controller';
import { ShopQrController } from './shop-qr.controller';
import { PublicShopController } from './public-shop.controller';

@Module({
  controllers: [AdminQrController, ShopQrController, PublicShopController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
