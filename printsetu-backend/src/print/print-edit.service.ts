import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { PDFDocument, degrees } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
} from '../common/exceptions/app.exceptions';
import { EditItemDto } from './dto/print.dto';
import { Prisma, PrintJobStatus } from '@prisma/client';

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * Shop-side document editing (rotate/crop/brightness/contrast/sharpness).
 * Always writes a NEW object under an `edits/` prefix and points
 * PrintJobItem.renderedS3Key at it — Document.s3Key (the original upload)
 * is never touched, so the pristine file stays recoverable. PrintJobsService
 * .dispatchToAgent prefers renderedS3Key over the original when present,
 * which is the only place this actually takes effect for printing.
 */
@Injectable()
export class PrintEditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  private async getEditableItemOrThrow(jobId: string, shopId: string, itemId: string) {
    const item = await this.prisma.printJobItem.findUnique({
      where: { id: itemId },
      include: { printJob: true, document: true },
    });
    if (!item || item.printJobId !== jobId || item.printJob.shopId !== shopId) {
      throw new AppNotFoundException('Print job item not found.');
    }
    if (item.printJob.status !== PrintJobStatus.PRINT_ELIGIBLE) {
      throw new InvalidPrintOptionException(
        `Documents can only be edited while the job is awaiting print (current status: ${item.printJob.status}).`,
      );
    }
    return item;
  }

  async applyEdit(jobId: string, shopId: string, itemId: string, dto: EditItemDto) {
    const item = await this.getEditableItemOrThrow(jobId, shopId, itemId);
    const { document } = item;
    const isPdf = document.mimeType === 'application/pdf';
    const wantsPixelEdit = !!(dto.brightness || dto.contrast || dto.sharpness);
    if (isPdf && wantsPixelEdit) {
      throw new InvalidPrintOptionException(
        'Brightness/contrast/sharpness adjustments are only supported for image documents, not PDFs.',
      );
    }

    const original = await this.storage.getObject(document.s3Key);
    const edited = isPdf ? await this.applyPdfEdits(original, dto) : await this.applyImageEdits(original, dto);

    const ext = MIME_EXTENSIONS[document.mimeType] ?? 'bin';
    const key = `${document.shopId}/${document.id}/edits/${itemId}-${Date.now()}.${ext}`;
    await this.storage.putObject({ key, body: edited, contentType: document.mimeType });

    const editState = {
      rotation: dto.rotation ?? 0,
      crop: dto.crop ? { x: dto.crop.x, y: dto.crop.y, width: dto.crop.width, height: dto.crop.height } : null,
      brightness: dto.brightness ?? 0,
      contrast: dto.contrast ?? 0,
      sharpness: dto.sharpness ?? 0,
    } satisfies Prisma.InputJsonValue;

    const previousRenderedKey = item.renderedS3Key;
    const updated = await this.prisma.printJobItem.update({
      where: { id: itemId },
      data: { editState, renderedS3Key: key, renderedAt: new Date() },
    });

    if (previousRenderedKey) {
      await this.storage.deleteObject(previousRenderedKey).catch(() => undefined);
    }

    return {
      itemId: updated.id,
      editState: updated.editState,
      renderedS3Key: updated.renderedS3Key,
      renderedAt: updated.renderedAt,
    };
  }

  /**
   * Stores the client-composited canvas export as the item's print-ready
   * file directly — no server-side re-render. Always re-encoded through
   * sharp so the stored object matches `document.mimeType` regardless of
   * what format the browser's canvas export produced.
   */
  async applyRenderedImage(
    jobId: string,
    shopId: string,
    itemId: string,
    file: Express.Multer.File | undefined,
    meta: { paperSize?: string; dpi?: string; format?: string; quality?: string },
  ) {
    const item = await this.getEditableItemOrThrow(jobId, shopId, itemId);
    const { document } = item;
    if (document.mimeType === 'application/pdf') {
      throw new InvalidPrintOptionException(
        'PDF documents use the rotate/crop tool, not the image canvas editor.',
      );
    }
    if (!file) {
      throw new InvalidPrintOptionException('No rendered image was uploaded.');
    }

    // The editor may pick the output format (PNG for graphics/text, JPEG for
    // photos); without an explicit choice keep the uploaded document's own.
    const isPng = meta.format === 'png' || (meta.format !== 'jpeg' && document.mimeType === 'image/png');
    const contentType = isPng ? 'image/png' : 'image/jpeg';
    const requestedQuality = Number(meta.quality);
    const quality = Number.isFinite(requestedQuality) ? Math.min(100, Math.max(50, Math.round(requestedQuality))) : 92;
    const pipeline = sharp(file.buffer);
    const normalized = await (isPng ? pipeline.png() : pipeline.jpeg({ quality })).toBuffer();

    const ext = MIME_EXTENSIONS[contentType];
    const key = `${document.shopId}/${document.id}/edits/${itemId}-${Date.now()}.${ext}`;
    await this.storage.putObject({ key, body: normalized, contentType });

    const dpi = meta.dpi ? Number(meta.dpi) : NaN;
    const editState = {
      source: 'canvas',
      paperSize: meta.paperSize ?? null,
      dpi: Number.isFinite(dpi) ? dpi : null,
    } satisfies Prisma.InputJsonValue;

    const previousRenderedKey = item.renderedS3Key;
    const updated = await this.prisma.printJobItem.update({
      where: { id: itemId },
      data: { editState, renderedS3Key: key, renderedAt: new Date() },
    });

    if (previousRenderedKey) {
      await this.storage.deleteObject(previousRenderedKey).catch(() => undefined);
    }

    return {
      itemId: updated.id,
      editState: updated.editState,
      renderedS3Key: updated.renderedS3Key,
      renderedAt: updated.renderedAt,
    };
  }

  async resetEdit(jobId: string, shopId: string, itemId: string) {
    const item = await this.getEditableItemOrThrow(jobId, shopId, itemId);
    if (item.renderedS3Key) {
      await this.storage.deleteObject(item.renderedS3Key).catch(() => undefined);
    }
    const updated = await this.prisma.printJobItem.update({
      where: { id: itemId },
      data: { editState: Prisma.DbNull, renderedS3Key: null, renderedAt: null },
    });
    return { itemId: updated.id };
  }

  /** Signs whichever object is currently authoritative for this item — the rendered edit if one exists, else the original. */
  async getItemPreviewUrl(jobId: string, shopId: string, itemId: string, original = false) {
    const item = await this.prisma.printJobItem.findUnique({
      where: { id: itemId },
      include: { printJob: true, document: true },
    });
    if (!item || item.printJobId !== jobId || item.printJob.shopId !== shopId) {
      throw new AppNotFoundException('Print job item not found.');
    }
    const key = original ? item.document.s3Key : (item.renderedS3Key ?? item.document.s3Key);
    const url = await this.storage.getSignedDownloadUrl(key, 120);
    return { url, expiresInSeconds: 120 };
  }

  private async applyImageEdits(buffer: Buffer, dto: EditItemDto): Promise<Buffer> {
    let pipeline = sharp(buffer);
    if (dto.rotation) pipeline = pipeline.rotate(dto.rotation);
    let out = await pipeline.toBuffer();

    if (dto.crop) {
      const meta = await sharp(out).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      const left = Math.max(0, Math.round(dto.crop.x * width));
      const top = Math.max(0, Math.round(dto.crop.y * height));
      const cropWidth = Math.max(1, Math.min(width - left, Math.round(dto.crop.width * width)));
      const cropHeight = Math.max(1, Math.min(height - top, Math.round(dto.crop.height * height)));
      out = await sharp(out).extract({ left, top, width: cropWidth, height: cropHeight }).toBuffer();
    }

    if (dto.brightness || dto.contrast) {
      let adjusted = sharp(out);
      if (dto.brightness) {
        adjusted = adjusted.modulate({ brightness: 1 + dto.brightness / 100 });
      }
      if (dto.contrast) {
        const factor = 1 + dto.contrast / 100;
        adjusted = adjusted.linear(factor, 128 * (1 - factor));
      }
      out = await adjusted.toBuffer();
    }

    if (dto.sharpness) {
      const sigma = 0.5 + (dto.sharpness / 100) * 2.5;
      out = await sharp(out).sharpen({ sigma }).toBuffer();
    }

    return out;
  }

  private async applyPdfEdits(buffer: Buffer, dto: EditItemDto): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(buffer);
    for (const page of pdfDoc.getPages()) {
      if (dto.rotation) {
        page.setRotation(degrees(dto.rotation));
      }
      if (dto.crop) {
        const { width, height } = page.getSize();
        const { x, y, width: w, height: h } = this.rotateCropToPageSpace(dto.crop, dto.rotation ?? 0);
        const cropWidth = w * width;
        const cropHeight = h * height;
        const cropX = x * width;
        // PDF coordinates are bottom-up; the (rotation-adjusted) rect is
        // still measured from the top like on-screen rects.
        const cropY = height - y * height - cropHeight;
        page.setCropBox(cropX, cropY, cropWidth, cropHeight);
      }
    }
    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  /**
   * The crop rect (fractions, top-left origin, y-down) is drawn on the
   * PREVIEW, which pdf.js renders already rotated by `rotation`. But
   * setCropBox always operates in the page's own un-rotated coordinate
   * space (page.setRotation is just a display flag) — so a rect drawn on a
   * 90°/270°-rotated preview has to be mapped back into that space, or the
   * crop ends up in the wrong place/aspect entirely. No-op for 0/180 in
   * position but 180 still mirrors both axes.
   */
  private rotateCropToPageSpace(
    crop: { x: number; y: number; width: number; height: number },
    rotation: number,
  ): { x: number; y: number; width: number; height: number } {
    const x2 = crop.x + crop.width;
    const y2 = crop.y + crop.height;

    // Map both opposite corners from displayed (rotated) space back to
    // base page space, then take the axis-aligned bounding box.
    const toBase = (dx: number, dy: number): [number, number] => {
      switch (((rotation % 360) + 360) % 360) {
        case 90:
          return [dy, 1 - dx];
        case 180:
          return [1 - dx, 1 - dy];
        case 270:
          return [1 - dy, dx];
        default:
          return [dx, dy];
      }
    };

    const [bx1, by1] = toBase(crop.x, crop.y);
    const [bx2, by2] = toBase(x2, y2);
    const x = Math.min(bx1, bx2);
    const y = Math.min(by1, by2);
    return { x, y, width: Math.abs(bx2 - bx1), height: Math.abs(by2 - by1) };
  }
}
