import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { QrService } from '../qr/qr.service';
import { FileValidationService } from './file-validation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DOCUMENT_ANALYSIS_QUEUE } from './document-queue.constants';
import { FileTooLargeException } from '../common/exceptions/app.exceptions';

describe('DocumentsService.upload (SRS §9 Upload stage)', () => {
  let service: DocumentsService;
  let prisma: { document: { create: jest.Mock }; printSettings: { findUnique: jest.Mock } };
  let queue: { add: jest.Mock };
  let storage: { putObject: jest.Mock };

  const file = {
    originalname: 'resume.pdf',
    size: 1024,
    buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10)]),
  } as unknown as Express.Multer.File;

  beforeEach(async () => {
    prisma = {
      document: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            pageCount: null,
            colorPages: null,
            colorDetectionConfidence: null,
            ...data,
          }),
        ),
      },
      printSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    storage = { putObject: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_SERVICE, useValue: storage },
        {
          provide: QrService,
          useValue: { resolvePublicCode: jest.fn().mockResolvedValue({ shopId: 'shop-1' }) },
        },
        { provide: FileValidationService, useValue: new FileValidationService() },
        {
          provide: NotificationsService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue({ maxUploadSizeBytes: 26214400, statusTokenSecret: 'test-secret' }),
          },
        },
        { provide: getQueueToken(DOCUMENT_ANALYSIS_QUEUE), useValue: queue },
      ],
    }).compile();

    service = moduleRef.get(DocumentsService);
  });

  it('stores the file, creates the document as UPLOADED (not analyzed yet) and enqueues an analysis job', async () => {
    const result = await service.upload('shop-code', file);

    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'UPLOADED' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'analyze',
      { documentId: expect.any(String) },
      expect.objectContaining({ attempts: expect.any(Number) }),
    );

    expect(result.status).toBe('UPLOADED');
    expect(result.pageCount).toBeNull();
    expect(result.docAccessToken).toEqual(expect.any(String));
  });

  it('never touches storage or the queue for an oversized file', async () => {
    prisma.printSettings.findUnique.mockResolvedValue({ maxFileSizeBytes: 100 });

    await expect(service.upload('shop-code', file)).rejects.toThrow(FileTooLargeException);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
