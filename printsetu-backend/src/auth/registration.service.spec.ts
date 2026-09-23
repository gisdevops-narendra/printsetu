import { Prisma } from '@prisma/client';
import { RegistrationService } from './registration.service';
import { EmailAlreadyRegisteredException } from '../common/exceptions/app.exceptions';
import { RegisterShopDto } from './dto/register.dto';

describe('RegistrationService.register (shop self-registration)', () => {
  const dto: RegisterShopDto = {
    shopName: '  Sai Xerox ',
    ownerName: 'Ravi Kumar Patel',
    mobile: '9000000000',
    email: 'Ravi@Example.com',
    address: 'Main Road',
    city: 'Surat',
    password: 'StrongPass123',
  };
  const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 300, tokenType: 'Bearer' };

  let prisma: any;
  let tx: any;
  let shopsService: { create: jest.Mock };
  let keycloakAdmin: { createUser: jest.Mock; deleteUser: jest.Mock };
  let authService: { signIn: jest.Mock };
  let audit: { log: jest.Mock };
  let service: RegistrationService;

  beforeEach(() => {
    tx = { user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) } };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-shopkeeper' }) },
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
    };
    shopsService = {
      create: jest.fn().mockResolvedValue({ id: 'shop-1', name: 'Sai Xerox', shopCode: 'SHOP-ABCDEFGH' }),
    };
    keycloakAdmin = {
      createUser: jest.fn().mockResolvedValue('kc-1'),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    authService = { signIn: jest.fn().mockResolvedValue(tokens) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new RegistrationService(
      prisma,
      shopsService as any,
      keycloakAdmin as any,
      authService as any,
      audit as any,
    );
  });

  it('creates the login with the chosen (permanent) password, then the shop + owner, and signs in', async () => {
    const result = await service.register(dto, { ip: '1.2.3.4' });

    expect(keycloakAdmin.createUser).toHaveBeenCalledWith({
      email: 'ravi@example.com',
      firstName: 'Ravi',
      lastName: 'Kumar Patel',
      role: 'SHOPKEEPER',
      password: 'StrongPass123',
    });
    expect(shopsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sai Xerox', ownerName: 'Ravi Kumar Patel', email: 'ravi@example.com' }),
      tx,
    );
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 'shop-1',
        roleId: 'role-shopkeeper',
        email: 'ravi@example.com',
        keycloakUserId: 'kc-1',
      }),
    });
    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.mustChangePassword).toBeUndefined();
    expect(userData.currentPasswordEnc).toBeUndefined();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHOP_REGISTERED', actorUserId: 'user-1', shopId: 'shop-1' }),
    );
    expect(authService.signIn).toHaveBeenCalledWith('ravi@example.com', 'StrongPass123');
    expect(result).toEqual({ ...tokens, shopId: 'shop-1' });
  });

  it('rejects an email that already has an account, before touching Keycloak', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.register(dto, {})).rejects.toThrow(EmailAlreadyRegisteredException);
    expect(keycloakAdmin.createUser).not.toHaveBeenCalled();
  });

  it('removes the Keycloak user again when the DB write fails', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    await expect(service.register(dto, {})).rejects.toThrow('db down');
    expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-1');
    expect(authService.signIn).not.toHaveBeenCalled();
  });

  it('maps a unique-constraint race on the email to EmailAlreadyRegistered', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' }),
    );

    await expect(service.register(dto, {})).rejects.toThrow(EmailAlreadyRegisteredException);
    expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-1');
  });
});
