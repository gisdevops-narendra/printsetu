import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrintJobsService } from './print-jobs.service';
import { ConfirmPrintJobDto, ReconcileJobDto } from './dto/print.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StatusTokenGuard } from '../common/guards/status-token.guard';
import { StatusToken } from '../common/decorators/status-token.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StatusTokenClaims, AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';

/** Customer-facing: confirm + track. SRS §17 auth column "Customer/status token". */
@Controller('print-jobs')
export class PrintJobsController {
  constructor(private readonly printJobsService: PrintJobsService) {}

  @Public()
  @UseGuards(StatusTokenGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  confirm(@Body() dto: ConfirmPrintJobDto, @StatusToken() claims: StatusTokenClaims) {
    return this.printJobsService.confirmFromQuote(dto, claims);
  }

  @Public()
  @UseGuards(StatusTokenGuard)
  @Get(':id')
  status(@Param('id') id: string, @StatusToken() claims: StatusTokenClaims) {
    return this.printJobsService.getStatusForCustomer(id, claims);
  }
}

/** Shopkeeper-facing queue + actions. */
@Controller('shop/print-jobs')
@Roles('SHOPKEEPER')
export class ShopPrintJobsController {
  constructor(private readonly printJobsService: PrintJobsService) {}

  private requireShop(user: AuthenticatedUser): string {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return user.shopId;
  }

  @Get()
  queue(@CurrentUser() user: AuthenticatedUser) {
    return this.printJobsService.shopQueue(this.requireShop(user));
  }

  @Get('history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.printJobsService.shopHistory(this.requireShop(user), parseInt(page, 10), parseInt(pageSize, 10));
  }

  /** SRS §17.2 example. */
  @Post(':id/print')
  print(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.printJobsService.triggerPrint(id, this.requireShop(user));
  }

  @Post(':id/reconcile')
  reconcile(
    @Param('id') id: string,
    @Body() dto: ReconcileJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.printJobsService.reconcile(id, this.requireShop(user), dto);
  }
}
