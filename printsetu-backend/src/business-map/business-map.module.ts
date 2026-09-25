import { Module } from '@nestjs/common';
import { BusinessMapController } from './business-map.controller';
import { BusinessMapService } from './business-map.service';
import { CoverageService } from './coverage.service';
import { LeadsService } from './leads.service';

@Module({
  controllers: [BusinessMapController],
  providers: [BusinessMapService, CoverageService, LeadsService],
})
export class BusinessMapModule {}
