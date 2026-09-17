import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ShopsService } from './shops.service';
import {
  CreateShopDto,
  UpdatePrintSettingsDto,
  UpdateShopDto,
  UpdateShopStatusDto,
} from './dto/shop.dto';
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

  @Post()
  async create(
    @Body() dto: CreateShopDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const shop = await this.shopsService.create(dto);
    await this.audit.log({
      actorUserId: user.id,
      shopId: shop.id,
      action: 'SHOP_CREATED',
      entityType: 'shop',
      entityId: shop.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { name: shop.name, shopCode: shop.shopCode },
    });
    return shop;
  }

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

  /** SRS §6/§9: admin-configurable retention window + max upload size per shop. */
  @Get(':id/settings')
  getSettings(@Param('id') id: string) {
    return this.shopsService.getSettings(id);
  }

  @Patch(':id/settings')
  async updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdatePrintSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const settings = await this.shopsService.updateSettings(id, dto);
    await this.audit.log({
      actorUserId: user.id,
      shopId: id,
      action: 'SHOP_SETTINGS_UPDATED',
      entityType: 'print_settings',
      entityId: settings.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { ...dto },
    });
    return settings;
  }
}
