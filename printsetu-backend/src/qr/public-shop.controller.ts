import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { QrService } from './qr.service';

@Controller('public/shops')
export class PublicShopController {
  constructor(private readonly qrService: QrService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':publicCode')
  async resolve(@Param('publicCode') publicCode: string) {
    const { shopName, city } = await this.qrService.resolvePublicCode(publicCode);
    return { shopCode: publicCode, shopName, city };
  }
}
