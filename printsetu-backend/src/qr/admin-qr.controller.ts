import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { QrService } from './qr.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';

@Controller('admin/qr')
@Roles('ADMIN')
export class AdminQrController {
  constructor(
    private readonly qrService: QrService,
    private readonly audit: AuditService,
  ) {}

  /** SRS §17: GET /api/admin/qr/:shopId — "Generate/retrieve QR". */
  @Get(':shopId')
  async getOrCreate(@Param('shopId') shopId: string) {
    return this.qrService.renderPngDataUrl(shopId);
  }

  @Post(':shopId/regenerate')
  async regenerate(
    @Param('shopId') shopId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.qrService.regenerate(shopId);
    await this.audit.log({
      actorUserId: user.id,
      shopId,
      action: 'QR_REGENERATED',
      entityType: 'qr_code',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return this.qrService.renderPngDataUrl(shopId);
  }
}
