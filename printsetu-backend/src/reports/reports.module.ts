import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ShopDashboardService } from './shop-dashboard.service';
import { AdminReportsController } from './admin-reports.controller';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [PrintModule],
  controllers: [AdminReportsController],
  providers: [ReportsService, ShopDashboardService],
})
export class ReportsModule {}
