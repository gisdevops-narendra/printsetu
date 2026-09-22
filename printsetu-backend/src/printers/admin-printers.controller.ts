import { Body, Controller, Delete, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { PrintersService } from './printers.service';
import { SetDefaultPrinterDto } from './dto/printer.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';

@Controller('admin/printers')
@Roles('ADMIN')
export class AdminPrintersController {
  constructor(
    private readonly printersService: PrintersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query('shopId') shopId?: string) {
    return shopId ? this.printersService.listForShop(shopId) : this.printersService.listAll();
  }

  @Patch('shops/:shopId/default')
  setDefault(@Param('shopId') shopId: string, @Body() dto: SetDefaultPrinterDto) {
    return this.printersService.setDefaultForShop(shopId, dto.printerId);
  }

  /** Unlinks/disconnects a printer-agent link — see PrintersService.remove for what that actually does. */
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    await this.printersService.remove(id);
    await this.audit.log({
      actorUserId: actor.id,
      action: 'PRINTER_REMOVED',
      entityType: 'printer',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { removed: true };
  }
}
