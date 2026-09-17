import { Injectable } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentProcessingConflictException } from '../common/exceptions/app.exceptions';
import { DOCUMENT_ALLOWED_TRANSITIONS, canTransitionDocument } from './document-status-machine';

export interface DocumentTransitionOptions {
  documentId: string;
  from: DocumentStatus;
  to: DocumentStatus;
  data?: Record<string, unknown>;
}

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compare-and-swap transition (mirrors PrintJobsRepository.transition):
   * the WHERE clause pins the expected current status so a duplicate/racing
   * worker attempt can never silently double-apply a result.
   */
  async transition(opts: DocumentTransitionOptions) {
    if (!canTransitionDocument(opts.from, opts.to)) {
      throw new Error(
        `Illegal document transition ${opts.from} -> ${opts.to}. Allowed: ${DOCUMENT_ALLOWED_TRANSITIONS[opts.from]?.join(', ')}`,
      );
    }

    const result = await this.prisma.document.updateMany({
      where: { id: opts.documentId, status: opts.from },
      data: { status: opts.to, ...opts.data },
    });
    if (result.count === 0) {
      throw new DocumentProcessingConflictException(
        `Document is not in ${opts.from} state (concurrent update or duplicate attempt).`,
      );
    }
    return this.prisma.document.findUniqueOrThrow({ where: { id: opts.documentId } });
  }
}
