import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';
import { PricingService } from './pricing.service';
import { SetPricingDto } from './dto/pricing.dto';

/** SRS §10: "Admin/shopkeeper can configure ... prices" — the shop owns its own rates. */
@Controller('shop/pricing')
@Roles('SHOPKEEPER')
export class ShopPricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  listActive(@CurrentUser() user: AuthenticatedUser) {
    const shopId = this.requireShopId(user);
    return this.pricingService.listActiveForShop(shopId);
  }

  @Get('history')
  listHistory(@CurrentUser() user: AuthenticatedUser) {
    const shopId = this.requireShopId(user);
    return this.pricingService.listHistoryForShop(shopId);
  }

  @Post()
  setRate(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPricingDto) {
    const shopId = this.requireShopId(user);
    return this.pricingService.setRate(shopId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const shopId = this.requireShopId(user);
    await this.pricingService.deactivate(shopId, id);
  }

  private requireShopId(user: AuthenticatedUser): string {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return user.shopId;
  }
}
