import { Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { QrStatus } from '@prisma/client';

// High-entropy, URL-safe, no ambiguous characters.
const publicCodeAlphabet = customAlphabet(
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  16,
);

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  private publicAppBaseUrl(): string {
    return process.env.PUBLIC_APP_BASE_URL || 'http://localhost:4200';
  }

  /**
   * Generate-or-retrieve semantics (SRS §17 "Generate/retrieve QR"): a shop
   * always has exactly one ACTIVE qr_codes row; calling this repeatedly
   * without regenerating returns the same code.
   */
  async getOrCreateActiveForShop(shopId: string) {
    const existing = await this.prisma.qrCode.findFirst({
      where: { shopId, status: QrStatus.ACTIVE },
      orderBy: { generatedAt: 'desc' },
    });
    if (existing) return existing;
    return this.createNew(shopId);
  }

  /**
   * Regenerating never breaks historical order ownership (SRS §12): print
   * jobs and documents key off shop_id, not qr_codes.id, so revoking the
   * old code and minting a new one has zero effect on past orders.
   */
  async regenerate(shopId: string) {
    await this.prisma.qrCode.updateMany({
      where: { shopId, status: QrStatus.ACTIVE },
      data: { status: QrStatus.REVOKED, revokedAt: new Date() },
    });
    return this.createNew(shopId);
  }

  private async createNew(shopId: string) {
    const publicCode = publicCodeAlphabet();
    return this.prisma.qrCode.create({
      data: {
        shopId,
        publicCode,
        targetPath: `/s/${publicCode}`,
        status: QrStatus.ACTIVE,
      },
    });
  }

  async renderPngDataUrl(shopId: string): Promise<{ dataUrl: string; url: string; code: string }> {
    const qr = await this.getOrCreateActiveForShop(shopId);
    const url = `${this.publicAppBaseUrl()}${qr.targetPath}`;
    const dataUrl = await QRCode.toDataURL(url, { margin: 2, width: 480 });
    return { dataUrl, url, code: qr.publicCode };
  }

  /** Resolves a scanned QR's public code to its shop — never exposes internal shop.id here. */
  async resolvePublicCode(publicCode: string) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode },
      include: { shop: true },
    });
    if (!qr || qr.status !== QrStatus.ACTIVE) {
      throw new AppNotFoundException('This QR code is not active.');
    }
    if (qr.shop.status !== 'ACTIVE') {
      throw new AppNotFoundException('This shop is not currently accepting print requests.');
    }
    return {
      shopId: qr.shop.id,
      shopName: qr.shop.name,
      city: qr.shop.city,
    };
  }
}
