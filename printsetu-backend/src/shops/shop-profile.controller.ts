import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';
import { ImageKind, ShopProfileService } from './shop-profile.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { UpdateShopProfileDto, UpdateShopSettingsDto } from './dto/shop-profile.dto';

enum ImageKindParam {
  logo = 'logo',
  banner = 'banner',
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * The shop owner's own profile: public details, logo/cover, performance
 * stats and settings. Pricing lives at /api/shop/pricing and printers at
 * /api/shop/printers, so they are not duplicated here.
 */
@Controller('shop')
@Roles('SHOPKEEPER')
export class ShopProfileController {
  constructor(
    private readonly profiles: ShopProfileService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  private shopIdOf(user: AuthenticatedUser): string {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return user.shopId;
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.getProfile(this.shopIdOf(user));
  }

  @Patch('profile')
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateShopProfileDto) {
    return this.profiles.updateProfile(this.shopIdOf(user), user.id, dto);
  }

  @Post('profile/:kind')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } }))
  uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind', new ParseEnumPipe(ImageKindParam)) kind: ImageKind,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.profiles.uploadImage(this.shopIdOf(user), user.id, kind, file);
  }

  @Delete('profile/:kind')
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind', new ParseEnumPipe(ImageKindParam)) kind: ImageKind,
  ) {
    return this.profiles.removeImage(this.shopIdOf(user), user.id, kind);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateShopSettingsDto) {
    return this.profiles.updateSettings(this.shopIdOf(user), user.id, dto);
  }

  @Get('stats')
  async stats(@CurrentUser() user: AuthenticatedUser) {
    const shopId = this.shopIdOf(user);
    await this.subscriptionAccess.assertFeature(shopId, 'analyticsAccess');
    return this.profiles.stats(shopId);
  }
}
