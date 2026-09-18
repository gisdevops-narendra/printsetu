import { PrintEditService } from './print-edit.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
  ShopAccessDeniedException,
} from '../common/exceptions/app.exceptions';

const sharpInstance = {
  rotate: jest.fn().mockReturnThis(),
  extract: jest.fn().mockReturnThis(),
  modulate: jest.fn().mockReturnThis(),
  linear: jest.fn().mockReturnThis(),
  sharpen: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('edited-image-bytes')),
  metadata: jest.fn().mockResolvedValue({ width: 1000, height: 2000 }),
};
jest.mock('sharp', () => jest.fn(() => sharpInstance));

jest.mock('pdf-lib', () => ({
  PDFDocument: { load: jest.fn() },
  degrees: (d: number) => d,
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFDocument } = require('pdf-lib');
const pdfPage = { setRotation: jest.fn(), setCropBox: jest.fn(), getSize: () => ({ width: 600, height: 800 }) };
const pdfDoc = { getPages: () => [pdfPage], save: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) };

describe('PrintEditService (shop document editor — rotate/crop/brightness/contrast/sharpness)', () => {
  let service: PrintEditService;
  let prisma: { printJobItem: { findUnique: jest.Mock; update: jest.Mock }; printSettings: { findUnique: jest.Mock } };
  let storage: {
    getObject: jest.Mock;
    putObject: jest.Mock;
    getSignedDownloadUrl: jest.Mock;
    deleteObject: jest.Mock;
  };

  const imageItem = {
    id: 'item-1',
    printJobId: 'job-1',
    renderedS3Key: null,
    printJob: { shopId: 'shop-1', status: 'PRINT_ELIGIBLE' },
    document: {
      id: 'doc-1',
      shopId: 'shop-1',
      mimeType: 'image/jpeg',
      s3Key: 'shop-1/doc-1/original.jpg',
    },
  };
  const pdfItem = {
    ...imageItem,
    id: 'item-2',
    document: { ...imageItem.document, id: 'doc-2', mimeType: 'application/pdf', s3Key: 'shop-1/doc-2/original.pdf' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sharpInstance.toBuffer.mockResolvedValue(Buffer.from('edited-image-bytes'));
    sharpInstance.metadata.mockResolvedValue({ width: 1000, height: 2000 });
    (PDFDocument.load as jest.Mock).mockResolvedValue(pdfDoc);
    pdfDoc.save.mockResolvedValue(new Uint8Array([1, 2, 3]));

    prisma = {
      printJobItem: {
        findUnique: jest.fn().mockResolvedValue(imageItem),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      },
      printSettings: { findUnique: jest.fn().mockResolvedValue({ documentPreviewEnabled: true }) },
    };
    storage = {
      getObject: jest.fn().mockResolvedValue(Buffer.from('original-bytes')),
      putObject: jest.fn().mockResolvedValue(undefined),
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    service = new PrintEditService(prisma as any, storage as any);
  });

  describe('applyEdit — images', () => {
    it('rotates/crops/adjusts an image and stores it under a new edits/ key, never touching the original', async () => {
      const result = await service.applyEdit('job-1', 'shop-1', 'item-1', {
        rotation: 90,
        crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
        brightness: 20,
      });

      expect(storage.getObject).toHaveBeenCalledWith('shop-1/doc-1/original.jpg');
      expect(sharpInstance.rotate).toHaveBeenCalledWith(90);
      expect(sharpInstance.extract).toHaveBeenCalledWith({ left: 0, top: 0, width: 500, height: 1000 });
      expect(sharpInstance.modulate).toHaveBeenCalledWith({ brightness: 1.2 });

      expect(storage.putObject).toHaveBeenCalledTimes(1);
      const putCall = storage.putObject.mock.calls[0][0];
      expect(putCall.key).toMatch(/^shop-1\/doc-1\/edits\/item-1-\d+\.jpg$/);
      expect(putCall.contentType).toBe('image/jpeg');

      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({
          editState: { rotation: 90, crop: { x: 0, y: 0, width: 0.5, height: 0.5 }, brightness: 20, contrast: 0, sharpness: 0 },
          renderedS3Key: putCall.key,
        }),
      });
      expect(result.editState).toEqual(
        expect.objectContaining({ rotation: 90, brightness: 20 }),
      );
    });

    it('deletes the previous rendered file when re-editing an already-edited item', async () => {
      prisma.printJobItem.findUnique.mockResolvedValue({ ...imageItem, renderedS3Key: 'shop-1/doc-1/edits/old.jpg' });

      await service.applyEdit('job-1', 'shop-1', 'item-1', { rotation: 180 });

      expect(storage.deleteObject).toHaveBeenCalledWith('shop-1/doc-1/edits/old.jpg');
    });
  });

  describe('applyEdit — PDFs', () => {
    beforeEach(() => {
      prisma.printJobItem.findUnique.mockResolvedValue(pdfItem);
    });

    it('rotates and crops PDF pages via pdf-lib', async () => {
      await service.applyEdit('job-1', 'shop-1', 'item-2', {
        rotation: 180,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      });

      expect(pdfPage.setRotation).toHaveBeenCalled();
      expect(pdfPage.setCropBox).toHaveBeenCalled();
      const putCall = storage.putObject.mock.calls[0][0];
      expect(putCall.key).toMatch(/\.pdf$/);
      expect(putCall.contentType).toBe('application/pdf');
    });

    it('rejects brightness/contrast/sharpness adjustments on PDFs (v1 scope limit)', async () => {
      await expect(
        service.applyEdit('job-1', 'shop-1', 'item-2', { brightness: 10 }),
      ).rejects.toThrow(InvalidPrintOptionException);
      expect(storage.getObject).not.toHaveBeenCalled();
    });
  });

  describe('guards', () => {
    it('rejects a job/item belonging to a different shop', async () => {
      await expect(service.applyEdit('job-1', 'shop-2', 'item-1', { rotation: 90 })).rejects.toThrow(
        AppNotFoundException,
      );
    });

    it('rejects editing once the job has left PRINT_ELIGIBLE', async () => {
      prisma.printJobItem.findUnique.mockResolvedValue({
        ...imageItem,
        printJob: { ...imageItem.printJob, status: 'QUEUED' },
      });
      await expect(service.applyEdit('job-1', 'shop-1', 'item-1', { rotation: 90 })).rejects.toThrow(
        InvalidPrintOptionException,
      );
    });
  });

  describe('resetEdit', () => {
    it('clears the edit state and deletes the rendered object', async () => {
      prisma.printJobItem.findUnique.mockResolvedValue({ ...imageItem, renderedS3Key: 'shop-1/doc-1/edits/old.jpg' });

      await service.resetEdit('job-1', 'shop-1', 'item-1');

      expect(storage.deleteObject).toHaveBeenCalledWith('shop-1/doc-1/edits/old.jpg');
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({ renderedS3Key: null, renderedAt: null }),
      });
    });
  });

  describe('getItemPreviewUrl', () => {
    it('signs the rendered file when present, otherwise the original', async () => {
      prisma.printJobItem.findUnique.mockResolvedValue({ ...imageItem, renderedS3Key: 'shop-1/doc-1/edits/x.jpg' });
      await service.getItemPreviewUrl('job-1', 'shop-1', 'item-1');
      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith('shop-1/doc-1/edits/x.jpg', 120);
    });

    it('rejects when the shop has not enabled document preview', async () => {
      prisma.printSettings.findUnique.mockResolvedValue({ documentPreviewEnabled: false });
      await expect(service.getItemPreviewUrl('job-1', 'shop-1', 'item-1')).rejects.toThrow(
        ShopAccessDeniedException,
      );
    });
  });
});
