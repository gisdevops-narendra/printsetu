import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('admin')
@Roles('ADMIN')
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('reports/summary')
  summary() {
    return this.reportsService.summary();
  }

  @Get('print-history')
  printHistory(
    @Query('shopId') shopId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.reportsService.printHistory(shopId, parseInt(page, 10), parseInt(pageSize, 10));
  }

  @Get('print-jobs/failed')
  failedJobs(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.reportsService.failedJobs(parseInt(page, 10), parseInt(pageSize, 10));
  }
}
