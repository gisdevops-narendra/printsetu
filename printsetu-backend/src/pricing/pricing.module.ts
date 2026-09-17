import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { AdminPricingController } from './admin-pricing.controller';

@Module({
  controllers: [AdminPricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
