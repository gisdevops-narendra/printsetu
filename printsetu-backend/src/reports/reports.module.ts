import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AdminReportsController } from './admin-reports.controller';

@Module({
  controllers: [AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
