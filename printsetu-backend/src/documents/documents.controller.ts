import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { DocumentsService } from './documents.service';
import { Public } from '../common/decorators/public.decorator';
import { StatusTokenGuard } from '../common/guards/status-token.guard';
import { StatusToken } from '../common/decorators/status-token.decorator';
import { StatusTokenClaims } from '../common/types/request-context';

const HARD_UPLOAD_CEILING_BYTES = parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '26214400', 10);

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * SRS §17: POST /api/documents — "Customer token / public signed
   * session". No account exists yet at this point in the flow, so the
   * only gate is a valid, active shop QR code (resolved server-side) plus
   * rate limiting + upload validation (§18).
   */
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: HARD_UPLOAD_CEILING_BYTES },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    const body = req.body as Record<string, unknown>;
    const shopCode = body?.shopCode;
    const sessionId = body?.sessionId;
    if (!file) {
      throw new BadRequestException('No file was uploaded.');
    }
    if (!shopCode || typeof shopCode !== 'string') {
      throw new BadRequestException('shopCode is required.');
    }
    if (sessionId !== undefined && typeof sessionId !== 'string') {
      throw new BadRequestException('sessionId must be a string.');
    }
    return this.documentsService.upload(shopCode, file, sessionId);
  }

  @Public()
  @UseGuards(StatusTokenGuard)
  @Get('session/:sessionId')
  async listForSession(@Param('sessionId') sessionId: string, @StatusToken() claims: StatusTokenClaims) {
    return this.documentsService.listForSession(sessionId, claims);
  }

  @Public()
  @UseGuards(StatusTokenGuard)
  @Get(':id')
  async get(@Param('id') id: string, @StatusToken() claims: StatusTokenClaims) {
    return this.documentsService.getForCustomer(id, claims);
  }
}
