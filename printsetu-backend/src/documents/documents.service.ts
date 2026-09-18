import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import { QrService } from '../qr/qr.service';
import { FileValidationService } from './file-validation.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  FileTooLargeException,
  ShopAccessDeniedException,
} from '../common/exceptions/app.exceptions';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { signToken } from '../common/utils/signed-token.util';
import { AppConfig } from '../config/configuration';
import { StatusTokenClaims } from '../common/types/request-context';
import { DOCUMENT_ANALYSIS_JOB_OPTS, DOCUMENT_ANALYSIS_QUEUE } from './document-queue.constants';
import { DocumentAnalysisJobData } from './document-analysis.processor';

const DOC_ACCESS_TOKEN_TTL_SECONDS = 30 * 60;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly qrService: QrService,
    private readonly fileValidation: FileValidationService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue(DOCUMENT_ANALYSIS_QUEUE)
    private readonly analysisQueue: Queue<DocumentAnalysisJobData>,
  ) {}

  /**
   * `sessionId` groups every document a customer uploads in one visit into
   * one eventual print request (SRS extension: "support uploading multiple
   * documents ... in a single session/print request"). The first upload of
   * a visit omits it and gets a freshly minted session back; every
   * subsequent upload (and a page reload — the client persists the id)
   * passes it so the new document joins the same session.
   */
  async upload(shopCode: string, file: Express.Multer.File, sessionId?: string) {
    const { shopId } = await this.qrService.resolvePublicCode(shopCode);

    const settings = await this.prisma.printSettings.findUnique({ where: { shopId } });
    const maxSize =
      settings?.maxFileSizeBytes ?? this.config.get('security', { infer: true }).maxUploadSizeBytes;
    if (file.size > maxSize) {
      throw new FileTooLargeException(
        `File exceeds the ${Math.floor(maxSize / (1024 * 1024))}MB limit for this shop.`,
      );
    }

    const session = sessionId
      ? await this.requireOwnSession(sessionId, shopId)
      : await this.prisma.printSession.create({ data: { shopId } });

    const mimeType = await this.fileValidation.assertSafeAndSupported(file.buffer);

    const documentId = uuid();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const s3Key = `${shopId}/${documentId}/${safeName}`;

    await this.storage.putObject({ key: s3Key, body: file.buffer, contentType: mimeType });

    // SRS §9: Upload stage stops at UPLOADED once the file is validated and
    // stored; page-count/color analysis is a separate Processing stage run
    // off the request path by DocumentAnalysisProcessor (BullMQ worker), so
    // the customer isn't blocked on the analysis service's latency.
    const document = await this.prisma.document.create({
      data: {
        id: documentId,
        shopId,
        sessionId: session.id,
        originalName: file.originalname,
        s3Key,
        mimeType,
        sizeBytes: file.size,
        status: DocumentStatus.UPLOADED,
      },
    });

    await this.analysisQueue.add(
      'analyze',
      { documentId: document.id },
      DOCUMENT_ANALYSIS_JOB_OPTS,
    );

    await this.notifications.record(shopId, null, 'UPLOAD_RECEIVED');

    // Session-scoped, not document-scoped: one token grants access to every
    // document already in (or later added to) this session, so the client
    // doesn't need to juggle a separate token per file, and a page reload
    // can restore the whole batch from just this one persisted token.
    const sessionToken = signToken(
      { shopId, sessionId: session.id, exp: Math.floor(Date.now() / 1000) + DOC_ACCESS_TOKEN_TTL_SECONDS },
      this.config.get('security', { infer: true }).statusTokenSecret,
    );

    return {
      documentId: document.id,
      sessionId: session.id,
      sessionToken,
      originalName: document.originalName,
      sizeBytes: document.sizeBytes,
      mimeType: document.mimeType,
      pageCount: document.pageCount,
      colorPages: document.colorPages,
      colorDetectionConfidence: document.colorDetectionConfidence,
      status: document.status,
    };
  }

  async getForCustomer(documentId: string, claims: StatusTokenClaims) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new AppNotFoundException('Document not found.');
    if (claims.sessionId !== document.sessionId || claims.shopId !== document.shopId) {
      throw new ShopAccessDeniedException('Status token does not grant access to this document.');
    }
    return document;
  }

  /**
   * Backs both the multi-upload file list (customer adds file #2, #3, ...)
   * and reload-recovery: on a fresh page load the client has only the
   * persisted sessionToken/sessionId and needs to rebuild "what did I
   * already upload" from scratch.
   */
  async listForSession(sessionId: string, claims: StatusTokenClaims) {
    await this.requireOwnSession(sessionId, claims.shopId, claims);
    return this.prisma.document.findMany({
      where: { sessionId },
      orderBy: { uploadedAt: 'asc' },
    });
  }

  private async requireOwnSession(sessionId: string, shopId: string, claims?: StatusTokenClaims) {
    if (claims && claims.sessionId !== sessionId) {
      throw new ShopAccessDeniedException('Status token does not grant access to this session.');
    }
    const session = await this.prisma.printSession.findUnique({ where: { id: sessionId } });
    if (!session || session.shopId !== shopId) {
      throw new AppNotFoundException('Upload session not found.');
    }
    return session;
  }

  async getPreviewUrlForShop(documentId: string, shopId: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new AppNotFoundException('Document not found.');
    if (document.shopId !== shopId) {
      throw new ShopAccessDeniedException('This document does not belong to your shop.');
    }
    if (document.status === DocumentStatus.DELETED) {
      throw new AppNotFoundException('Document has been deleted per retention policy.');
    }
    const settings = await this.prisma.printSettings.findUnique({ where: { shopId } });
    if (!settings?.documentPreviewEnabled) {
      throw new ShopAccessDeniedException(
        'Document preview is not enabled for your shop. Ask your admin to turn it on.',
      );
    }
    const url = await this.storage.getSignedDownloadUrl(document.s3Key, 120);
    return { url, expiresInSeconds: 120 };
  }
}
