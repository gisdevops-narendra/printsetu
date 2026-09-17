import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';

/** SRS §7: "Shop profile and pricing visibility" (read-only for shopkeeper). */
@Controller('shop')
@Roles('SHOPKEEPER')
export class ShopProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('profile')
  async profile(@CurrentUser() user: AuthenticatedUser) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    const shop = await this.prisma.shop.findUnique({
      where: { id: user.shopId },
      include: { printSettings: true },
    });
    const pricing = await this.prisma.pricing.findMany({
      where: { shopId: user.shopId, active: true },
      orderBy: [{ paperSize: 'asc' }, { colorMode: 'asc' }, { sideMode: 'asc' }],
    });
    return { shop, pricing };
  }
}
