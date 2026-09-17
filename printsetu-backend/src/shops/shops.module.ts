import { Module } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { AdminShopsController } from './admin-shops.controller';
import { ShopProfileController } from './shop-profile.controller';

@Module({
  controllers: [AdminShopsController, ShopProfileController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
