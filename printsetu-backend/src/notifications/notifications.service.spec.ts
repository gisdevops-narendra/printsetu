import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService (SRS §20 in-app notification baseline)', () => {
  let service: NotificationsService;
  let prisma: {
    notification: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'n1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  it('record() always writes an IN_APP/SENT row', async () => {
    await service.record('shop-1', 'job-1', 'PRINT_QUEUED');
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop-1',
        printJobId: 'job-1',
        eventType: 'PRINT_QUEUED',
        channel: 'IN_APP',
        status: 'SENT',
      },
    });
  });

  it('record() omits printJobId when null (e.g. UPLOAD_RECEIVED has no job yet)', async () => {
    await service.record('shop-1', null, 'UPLOAD_RECEIVED');
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop-1',
        printJobId: undefined,
        eventType: 'UPLOAD_RECEIVED',
        channel: 'IN_APP',
        status: 'SENT',
      },
    });
  });

  it('listForShop() paginates and scopes strictly to the given shop', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 'n1', shopId: 'shop-1' }]);
    prisma.notification.count.mockResolvedValue(1);

    const result = await service.listForShop('shop-1', 2, 10);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: 10,
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { shopId: 'shop-1' } });
    expect(result).toEqual({
      items: [{ id: 'n1', shopId: 'shop-1' }],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('listForShop() clamps an oversized pageSize to the 200 ceiling', async () => {
    await service.listForShop('shop-1', 1, 10_000);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});
