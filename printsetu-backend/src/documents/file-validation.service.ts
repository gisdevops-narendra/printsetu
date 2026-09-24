import { Injectable } from '@nestjs/common';
import { UnsupportedDocumentException } from '../common/exceptions/app.exceptions';

/**
 * SRS §5.2 baseline formats: PDF, JPG/JPEG, PNG only (DOC/DOCX excluded —
 * no verified conversion path is being built in Phase 1). SRS §18:
 * "Strict file extension + MIME + magic-byte validation; reject
 * executable/script content." We trust none of extension/declared-MIME —
 * only the sniffed magic bytes decide the real type.
 *
 * Implemented as direct signature checks (rather than a third-party
 * sniffing library) since the allow-list is small and fixed; this also
 * sidesteps ESM-only packages (e.g. `file-type` v17+) that don't load
 * cleanly from NestJS's CommonJS build output.
 */
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

@Injectable()
export class FileValidationService {
  async assertSafeAndSupported(buffer: Buffer): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new UnsupportedDocumentException('Uploaded file is empty.');
    }

    const match = SIGNATURES.find((sig) => {
      const offset = sig.offset ?? 0;
      if (buffer.length < offset + sig.bytes.length) return false;
      return sig.bytes.every((byte, i) => buffer[offset + i] === byte);
    });

    if (!match) {
      throw new UnsupportedDocumentException('Only PDF, JPG and PNG files can be printed.');
    }
    return match.mime;
  }
}
