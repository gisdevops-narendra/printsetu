import { Module } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { ShopProfileService } from './shop-profile.service';
import { AdminShopsController } from './admin-shops.controller';
import { ShopProfileController } from './shop-profile.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [AdminShopsController, ShopProfileController],
  providers: [ShopsService, ShopProfileService],
  exports: [ShopsService],
})
export class ShopsModule {}
