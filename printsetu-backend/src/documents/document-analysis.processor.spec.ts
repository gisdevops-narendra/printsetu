import { Test } from '@nestjs/testing';
import { DocumentStatus } from '@prisma/client';
import { DocumentAnalysisProcessor } from './document-analysis.processor';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { AnalysisClientService } from './analysis-client.service';
import { DocumentsRepository } from './documents.repository';

describe('DocumentAnalysisProcessor (SRS §9 Processing stage / §14 BullMQ worker)', () => {
  let processor: DocumentAnalysisProcessor;
  let prisma: { document: { findUnique: jest.Mock } };
  let storage: { getObject: jest.Mock };
  let analysisClient: { analyze: jest.Mock };
  let repo: { transition: jest.Mock };

  const baseDocument = {
    id: 'doc-1',
    status: DocumentStatus.UPLOADED,
    s3Key: 'shop-1/doc-1/resume.pdf',
    mimeType: 'application/pdf',
    originalName: 'resume.pdf',
  };

  beforeEach(async () => {
    prisma = { document: { findUnique: jest.fn().mockResolvedValue(baseDocument) } };
    storage = { getObject: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) };
    analysisClient = { analyze: jest.fn() };
    repo = {
      transition: jest
        .fn()
        .mockImplementation((opts) => Promise.resolve({ ...baseDocument, status: opts.to })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentAnalysisProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: AnalysisClientService, useValue: analysisClient },
        { provide: DocumentsRepository, useValue: repo },
      ],
    }).compile();

    processor = moduleRef.get(DocumentAnalysisProcessor);
  });

  function job(overrides: Partial<{ attemptsMade: number }> = {}) {
    return {
      data: { documentId: 'doc-1' },
      attemptsMade: overrides.attemptsMade ?? 0,
      opts: { attempts: 3 },
    } as any;
  }

  it('moves UPLOADED -> PROCESSING -> PROCESSED and stores the analysis result', async () => {
    analysisClient.analyze.mockResolvedValue({ pageCount: 4, colorPages: 1, confidence: 'HIGH' });

    await processor.process(job());

    expect(repo.transition).toHaveBeenNthCalledWith(1, {
      documentId: 'doc-1',
      from: DocumentStatus.UPLOADED,
      to: DocumentStatus.PROCESSING,
    });
    expect(repo.transition).toHaveBeenNthCalledWith(2, {
      documentId: 'doc-1',
      from: DocumentStatus.PROCESSING,
      to: DocumentStatus.PROCESSED,
      data: { pageCount: 4, colorPages: 1, colorDetectionConfidence: 'HIGH' },
    });
  });

  it('re-enters PROCESSING from ANALYSIS_FAILED on a retry attempt', async () => {
    prisma.document.findUnique.mockResolvedValue({
      ...baseDocument,
      status: DocumentStatus.ANALYSIS_FAILED,
    });
    analysisClient.analyze.mockResolvedValue({ pageCount: 2, colorPages: 0, confidence: 'HIGH' });

    await processor.process(job({ attemptsMade: 1 }));

    expect(repo.transition).toHaveBeenNthCalledWith(1, {
      documentId: 'doc-1',
      from: DocumentStatus.ANALYSIS_FAILED,
      to: DocumentStatus.PROCESSING,
    });
  });

  it('throws (to trigger a BullMQ retry) when the analysis service returns no result', async () => {
    analysisClient.analyze.mockResolvedValue(null);

    await expect(processor.process(job())).rejects.toThrow();
    expect(repo.transition).toHaveBeenCalledTimes(1); // only the UPLOADED -> PROCESSING move
    expect(repo.transition).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: DocumentStatus.ANALYSIS_FAILED }),
    );
  });

  it('is a no-op for a document that was deleted before analysis ran', async () => {
    prisma.document.findUnique.mockResolvedValue({
      ...baseDocument,
      status: DocumentStatus.DELETED,
    });

    await processor.process(job());

    expect(storage.getObject).not.toHaveBeenCalled();
    expect(repo.transition).not.toHaveBeenCalled();
  });

  describe('onFailed (permanent-failure marking)', () => {
    it('marks ANALYSIS_FAILED only once retries are exhausted', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        status: DocumentStatus.PROCESSING,
      });

      await processor.onFailed(job({ attemptsMade: 3 })); // attemptsMade === opts.attempts -> exhausted

      expect(repo.transition).toHaveBeenCalledWith({
        documentId: 'doc-1',
        from: DocumentStatus.PROCESSING,
        to: DocumentStatus.ANALYSIS_FAILED,
      });
    });

    it('does not mark ANALYSIS_FAILED while retries remain', async () => {
      await processor.onFailed(job({ attemptsMade: 1 })); // 1 < 3 attempts -> more retries scheduled

      expect(repo.transition).not.toHaveBeenCalled();
    });

    it('does not overwrite a document that already resolved (e.g. deleted) before the final failure landed', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        status: DocumentStatus.DELETED,
      });

      await processor.onFailed(job({ attemptsMade: 3 }));

      expect(repo.transition).not.toHaveBeenCalled();
    });
  });
});
