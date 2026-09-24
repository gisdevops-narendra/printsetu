import { UsersService } from './users.service';

describe('UsersService preferences (UI language)', () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ language: data.language })),
      },
    };
    service = new UsersService(prisma as any);
  });

  it("returns the user's saved language", async () => {
    prisma.user.findUnique.mockResolvedValue({ language: 'gu' });

    await expect(service.getPreferences('user-1')).resolves.toEqual({ language: 'gu' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { language: true },
    });
  });

  it('falls back to English for an unknown stored value', async () => {
    prisma.user.findUnique.mockResolvedValue({ language: 'fr' });

    await expect(service.getPreferences('user-1')).resolves.toEqual({ language: 'en' });
  });

  it("saves the language on the signed-in user's own row", async () => {
    await expect(service.updatePreferences('user-1', { language: 'hi' })).resolves.toEqual({
      language: 'hi',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { language: 'hi' },
      select: { language: true },
    });
  });
});
