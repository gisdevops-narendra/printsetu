import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  const lead = {
    id: 'lead-1',
    name: 'Shree Xerox',
    contactName: 'Mehul',
    mobile: '+91 98765 43210',
    email: null,
    address: null,
    city: 'Surat',
    district: null,
    notes: null,
    status: 'DEMO_GIVEN',
    shopId: null,
    latitude: 21.17,
    longitude: 72.83,
    createdById: 'admin-1',
    createdAt: new Date('2026-09-20'),
    updatedAt: new Date('2026-09-21'),
  };
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: LeadsService;

  beforeEach(() => {
    prisma = {
      lead: {
        findMany: jest.fn().mockResolvedValue([{ ...lead, shop: null }]),
        findUnique: jest.fn().mockResolvedValue(lead),
        create: jest.fn(({ data }: any) => Promise.resolve({ ...lead, ...data })),
        update: jest.fn(({ data }: any) => Promise.resolve({ ...lead, ...data })),
        delete: jest.fn().mockResolvedValue(lead),
      },
      shop: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'shop-9',
            name: 'Shree Xerox & Prints',
            shopCode: 'SHOP-9',
            mobile: '9876543210',
            email: 'x@y.com',
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({ id: 'shop-9' }),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new LeadsService(prisma, audit as any);
  });

  it('lists leads as GeoJSON and suggests the shop that registered with the same mobile', async () => {
    const result = await service.list();

    expect(result.features[0].geometry.coordinates).toEqual([72.83, 21.17]);
    expect(result.features[0].properties.suggestedShop).toEqual({
      id: 'shop-9',
      name: 'Shree Xerox & Prints',
      shopCode: 'SHOP-9',
    });
    expect(result.meta.counts).toMatchObject({ DEMO_GIVEN: 1, JOINED: 0 });
  });

  it('adds a lead as Contacted by default, with blanks stored as empty', async () => {
    await service.create(
      { name: ' New Shop ', mobile: '  ', latitude: 21, longitude: 72 },
      'admin-1',
    );

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'New Shop',
        mobile: null,
        status: 'CONTACTED',
        createdById: 'admin-1',
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LEAD_ADDED' }));
  });

  it('marks a lead Joined and links the shop', async () => {
    await service.update('lead-1', { status: 'JOINED', shopId: 'shop-9' } as any, 'admin-1');

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { status: 'JOINED', shopId: 'shop-9' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LEAD_UPDATED',
        metadata: expect.objectContaining({ from: 'DEMO_GIVEN', to: 'JOINED' }),
      }),
    );
  });

  it('unlinks the shop when a lead is moved off Joined', async () => {
    prisma.lead.findUnique.mockResolvedValue({ ...lead, status: 'JOINED', shopId: 'shop-9' });

    await service.update('lead-1', { status: 'NOT_INTERESTED' } as any, 'admin-1');

    expect(prisma.lead.update.mock.calls[0][0].data).toMatchObject({
      status: 'NOT_INTERESTED',
      shopId: null,
    });
  });

  it('refuses to edit or delete a lead that no longer exists', async () => {
    prisma.lead.findUnique.mockResolvedValue(null);
    await expect(service.update('lead-x', { name: 'x' }, 'admin-1')).rejects.toThrow(
      'no longer exists',
    );
    await expect(service.remove('lead-x', 'admin-1')).rejects.toThrow('no longer exists');
  });
});
