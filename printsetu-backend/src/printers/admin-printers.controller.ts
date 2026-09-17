import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { SetDefaultPrinterDto } from './dto/printer.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/printers')
@Roles('ADMIN')
export class AdminPrintersController {
  constructor(private readonly printersService: PrintersService) {}

  @Get()
  list(@Query('shopId') shopId?: string) {
    return shopId ? this.printersService.listForShop(shopId) : this.printersService.listAll();
  }

  @Patch('shops/:shopId/default')
  setDefault(@Param('shopId') shopId: string, @Body() dto: SetDefaultPrinterDto) {
    return this.printersService.setDefaultForShop(shopId, dto.printerId);
  }
}
