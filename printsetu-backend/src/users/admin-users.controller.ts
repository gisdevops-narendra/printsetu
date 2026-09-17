import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { AdminUsersService } from './admin-users.service';
import { CreateUserDto, UpdateUserStatusDto } from './dto/admin-user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';

@Controller('admin/users')
@Roles('ADMIN')
export class AdminUsersController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query('shopId') shopId?: string) {
    return this.adminUsersService.list(shopId);
  }

  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const user = await this.adminUsersService.create(dto);
    await this.audit.log({
      actorUserId: actor.id,
      shopId: dto.shopId,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { role: dto.role, email: dto.email },
    });
    return user;
  }

  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const user = await this.adminUsersService.setStatus(id, dto.status);
    await this.audit.log({
      actorUserId: actor.id,
      action: dto.status === 'ACTIVE' ? 'USER_ENABLED' : 'USER_DISABLED',
      entityType: 'user',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return user;
  }
}
