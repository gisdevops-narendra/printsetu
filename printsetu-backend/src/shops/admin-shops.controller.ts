import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ShopsService } from './shops.service';
import { UpdateShopDto, UpdateShopStatusDto } from './dto/shop.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/request-context';

@Controller('admin/shops')
@Roles('ADMIN')
export class AdminShopsController {
  constructor(
    private readonly shopsService: ShopsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.shopsService.list(parseInt(page, 10), parseInt(pageSize, 10));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.shopsService.findByIdOrThrow(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateShopDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const shop = await this.shopsService.update(id, dto);
    await this.audit.log({
      actorUserId: user.id,
      shopId: id,
      action: 'SHOP_UPDATED',
      entityType: 'shop',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { ...dto },
    });
    return shop;
  }

  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShopStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const shop = await this.shopsService.setStatus(id, dto.status);
    await this.audit.log({
      actorUserId: user.id,
      shopId: id,
      action: dto.status === 'ACTIVE' ? 'SHOP_ACTIVATED' : 'SHOP_DEACTIVATED',
      entityType: 'shop',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return shop;
  }

}
