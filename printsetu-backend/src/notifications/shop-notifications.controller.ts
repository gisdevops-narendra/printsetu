import { Controller, Delete, Get, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';

/**
 * SRS §20 "Phase 1 will provide in-application status as the baseline" —
 * this is that baseline's read surface. NotificationsService.record()
 * already writes UPLOAD_RECEIVED/PRINT_QUEUED/PRINT_COMPLETED/PRINT_FAILED
 * rows from the upload and print-job flows; this endpoint is the only way
 * a shopkeeper can actually see them.
 */
@Controller('shop/notifications')
@Roles('SHOPKEEPER')
export class ShopNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return this.notifications.listForShop(user.shopId, parseInt(page, 10), parseInt(pageSize, 10));
  }

  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return this.notifications.clearForShop(user.shopId);
  }
}
