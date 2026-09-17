import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { ShopPricingController } from './shop-pricing.controller';

@Module({
  controllers: [ShopPricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
