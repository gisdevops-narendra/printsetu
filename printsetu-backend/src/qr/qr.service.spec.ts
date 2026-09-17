import { Test } from '@nestjs/testing';
import { QrService } from './qr.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';

describe('QrService.resolvePublicCode (SRS §12 shop resolution, tenant isolation)', () => {
  let service: QrService;
  let prisma: { qrCode: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { qrCode: { findUnique: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [QrService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(QrService);
  });

  it('resolves an active code for an active shop', async () => {
    prisma.qrCode.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      shop: { id: 'shop-1', name: 'Demo Shop', city: 'Ahmedabad', status: 'ACTIVE' },
    });
    const result = await service.resolvePublicCode('abc123');
    expect(result).toEqual({ shopId: 'shop-1', shopName: 'Demo Shop', city: 'Ahmedabad' });
  });

  it('rejects an unknown code', async () => {
    prisma.qrCode.findUnique.mockResolvedValue(null);
    await expect(service.resolvePublicCode('does-not-exist')).rejects.toThrow(AppNotFoundException);
  });

  it('rejects a revoked code (post-regeneration, per SRS §12)', async () => {
    prisma.qrCode.findUnique.mockResolvedValue({
      status: 'REVOKED',
      shop: { id: 'shop-1', name: 'Demo Shop', city: 'Ahmedabad', status: 'ACTIVE' },
    });
    await expect(service.resolvePublicCode('old-code')).rejects.toThrow(AppNotFoundException);
  });

  it('rejects a valid code whose shop has since been deactivated', async () => {
    prisma.qrCode.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      shop: { id: 'shop-1', name: 'Demo Shop', city: 'Ahmedabad', status: 'INACTIVE' },
    });
    await expect(service.resolvePublicCode('abc123')).rejects.toThrow(AppNotFoundException);
  });
});
