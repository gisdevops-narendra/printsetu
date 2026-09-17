import { FileValidationService } from './file-validation.service';
import { UnsupportedDocumentException } from '../common/exceptions/app.exceptions';

describe('FileValidationService (SRS §18 magic-byte validation)', () => {
  const service = new FileValidationService();

  it('accepts a valid PDF signature', async () => {
    const buffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10)]);
    await expect(service.assertSafeAndSupported(buffer)).resolves.toBe('application/pdf');
  });

  it('accepts a valid JPEG signature', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await expect(service.assertSafeAndSupported(buffer)).resolves.toBe('image/jpeg');
  });

  it('accepts a valid PNG signature', async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    await expect(service.assertSafeAndSupported(buffer)).resolves.toBe('image/png');
  });

  it('rejects an executable disguised with a .pdf name (magic bytes are what matter)', async () => {
    // MZ header = Windows PE/EXE, not a real PDF, regardless of filename/declared MIME.
    const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    await expect(service.assertSafeAndSupported(buffer)).rejects.toThrow(UnsupportedDocumentException);
  });

  it('rejects an empty file', async () => {
    await expect(service.assertSafeAndSupported(Buffer.alloc(0))).rejects.toThrow(UnsupportedDocumentException);
  });

  it('rejects a truncated/short buffer that cannot contain a signature', async () => {
    await expect(service.assertSafeAndSupported(Buffer.from([0x89, 0x50]))).rejects.toThrow(
      UnsupportedDocumentException,
    );
  });
});
