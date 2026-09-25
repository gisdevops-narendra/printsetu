import { Controller, Get, Header, Param } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';

/** SRS §7: "Document preview via authorized temporary URL" for shopkeepers. */
@Controller('shop/documents')
@Roles('SHOPKEEPER')
export class ShopDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // A signed link expires in 120s — never let a browser or proxy cache the response and hand it out again.
  @Get(':id/preview-url')
  @Header('Cache-Control', 'private, no-store')
  async previewUrl(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return this.documentsService.getPreviewUrlForShop(id, user.shopId);
  }
}
