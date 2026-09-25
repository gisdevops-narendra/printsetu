import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { BusinessMapService } from './business-map.service';
import { CoverageService } from './coverage.service';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';

/** Admin-only Business Map data, as GeoJSON. `from`/`to` are inclusive YYYY-MM-DD days (default: this month). */
@Controller('admin/map')
@Roles('ADMIN')
export class BusinessMapController {
  constructor(
    private readonly map: BusinessMapService,
    private readonly coverage: CoverageService,
    private readonly leads: LeadsService,
  ) {}

  @Get('shops')
  shops(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('inactiveDays') inactiveDays?: string,
  ) {
    return this.map.shops({
      from,
      to,
      inactiveDays: inactiveDays ? Number(inactiveDays) : undefined,
    });
  }

  @Get('areas')
  areas(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.map.areas({ from, to, groupBy });
  }

  /** `bbox` = west,south,east,north; `radius` in metres (default 1000). */
  @Get('coverage')
  coverageGaps(@Query('bbox') bbox?: string, @Query('radius') radius?: string) {
    return this.coverage.coverage({ bbox, radius });
  }

  @Get('leads')
  listLeads() {
    return this.leads.list();
  }

  @Post('leads')
  createLead(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.create(dto, user.id);
  }

  @Patch('leads/:id')
  updateLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.update(id, dto, user.id);
  }

  @Delete('leads/:id')
  deleteLead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.remove(id, user.id);
  }
}
