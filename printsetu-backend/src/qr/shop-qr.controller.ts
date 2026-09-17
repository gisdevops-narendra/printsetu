import { Controller, Get } from '@nestjs/common';
import { QrService } from './qr.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';

/**
 * SRS §7/§12: the shop can view/download its own QR to reprint a damaged
 * sheet. Regenerating invalidates the old code immediately, so that stays
 * admin-only (AdminQrController) rather than being duplicated here.
 */
@Controller('shop/qr')
@Roles('SHOPKEEPER')
export class ShopQrController {
  constructor(private readonly qrService: QrService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return this.qrService.renderPngDataUrl(user.shopId);
  }
}
