import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { PricingService } from './pricing.service';
import { SetPricingDto } from './dto/pricing.dto';

@Controller('admin/shops/:shopId/pricing')
@Roles('ADMIN')
export class AdminPricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  listActive(@Param('shopId') shopId: string) {
    return this.pricingService.listActiveForShop(shopId);
  }

  @Get('history')
  listHistory(@Param('shopId') shopId: string) {
    return this.pricingService.listHistoryForShop(shopId);
  }

  @Post()
  setRate(@Param('shopId') shopId: string, @Body() dto: SetPricingDto) {
    return this.pricingService.setRate(shopId, dto);
  }
}
