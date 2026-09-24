import { Controller, Delete, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ReportsService } from './reports.service';
import { ShopDashboardService } from './shop-dashboard.service';
import { PrintJobsService } from '../print/print-jobs.service';

@Controller('admin')
@Roles('ADMIN')
export class AdminReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly shopDashboard: ShopDashboardService,
    private readonly printJobsService: PrintJobsService,
  ) {}

  @Get('reports/summary')
  summary() {
    return this.reportsService.summary();
  }

  /**
   * Shop-wise dashboard; `from`/`to` are inclusive YYYY-MM-DD days (default:
   * this month to date). `shopId` narrows every figure to one shop.
   */
  @Get('reports/shops')
  shopSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('shopId') shopId?: string,
  ) {
    return this.shopDashboard.shopSummary(from, to, shopId || undefined);
  }

  @Get('print-history')
  printHistory(
    @Query('shopId') shopId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.reportsService.printHistory(shopId, parseInt(page, 10), parseInt(pageSize, 10));
  }

  /** Clears finished (DELETED/CANCELLED) history rows; all shops unless shopId is given. */
  @Delete('print-history')
  clearPrintHistory(
    @Query('shopId') shopId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.printJobsService.clearHistory(user.id, shopId);
  }

  @Get('print-jobs/failed')
  failedJobs(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.reportsService.failedJobs(parseInt(page, 10), parseInt(pageSize, 10));
  }
}
