import { Prisma } from '@prisma/client';
import { RegistrationService } from './registration.service';
import {
  EmailAlreadyRegisteredException,
  InvalidOtpException,
} from '../common/exceptions/app.exceptions';
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
    otp: '123456',
  };
  const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 300, tokenType: 'Bearer' };

  let prisma: any;
  let tx: any;
  let shopsService: { create: jest.Mock };
  let keycloakAdmin: { createUser: jest.Mock; deleteUser: jest.Mock };
  let authService: { signIn: jest.Mock };
  let audit: { log: jest.Mock };
  let otp: { send: jest.Mock; verify: jest.Mock; consume: jest.Mock };
  let mail: { send: jest.Mock };
  let config: { get: jest.Mock };
  let service: RegistrationService;

  beforeEach(() => {
    tx = { user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) } };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ email: 'admin@printsetu.local' }]),
      },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-shopkeeper' }) },
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
    };
    shopsService = {
      create: jest.fn().mockResolvedValue({
        id: 'shop-1',
        name: 'Sai Xerox',
        shopCode: 'SHOP-ABCDEFGH',
        createdAt: new Date('2026-09-25T06:30:00Z'),
      }),
    };
    keycloakAdmin = {
      createUser: jest.fn().mockResolvedValue('kc-1'),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    authService = { signIn: jest.fn().mockResolvedValue(tokens) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    otp = {
      send: jest.fn().mockResolvedValue({ expiresInSeconds: 600, resendAfterSeconds: 60 }),
      verify: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    const settings: Record<string, unknown> = {
      appBaseUrl: 'https://app.printsetu.test',
      mail: { adminEmails: [] },
      shopTimeZone: 'Asia/Kolkata',
    };
    config = { get: jest.fn((key: string) => settings[key]) };
    service = new RegistrationService(
      prisma,
      shopsService as any,
      keycloakAdmin as any,
      authService as any,
      audit as any,
      otp as any,
      mail as any,
      config as any,
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
      expect.objectContaining({
        name: 'Sai Xerox',
        ownerName: 'Ravi Kumar Patel',
        email: 'ravi@example.com',
      }),
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
      expect.objectContaining({
        action: 'SHOP_REGISTERED',
        actorUserId: 'user-1',
        shopId: 'shop-1',
      }),
    );
    expect(authService.signIn).toHaveBeenCalledWith('ravi@example.com', 'StrongPass123');
    expect(result).toEqual({ ...tokens, shopId: 'shop-1' });
    expect(otp.verify).toHaveBeenCalledWith('REGISTRATION', 'ravi@example.com', '123456');
    expect(otp.consume).toHaveBeenCalledWith('REGISTRATION', 'ravi@example.com');
  });

  it('sendOtp() emails a registration code to a new address', async () => {
    await expect(service.sendOtp(' Ravi@Example.com ')).resolves.toEqual({
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });

    expect(otp.send).toHaveBeenCalledWith('REGISTRATION', 'ravi@example.com', expect.any(Function));
    const message = otp.send.mock.calls[0][2]('654321', 10);
    expect(message.to).toBe('ravi@example.com');
    expect(message.text).toContain('654321');
  });

  it('sendOtp() refuses an address that already has an account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.sendOtp('ravi@example.com')).rejects.toThrow(
      EmailAlreadyRegisteredException,
    );
    expect(otp.send).not.toHaveBeenCalled();
  });

  it('creates nothing when the emailed code is wrong', async () => {
    otp.verify.mockRejectedValue(new InvalidOtpException());

    await expect(service.register(dto, {})).rejects.toThrow(InvalidOtpException);
    expect(keycloakAdmin.createUser).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('emails the owner a welcome and the admins the new shop, without the password', async () => {
    await service.register(dto, {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(mail.send).toHaveBeenCalledTimes(2);
    const [welcome, adminMail] = mail.send.mock.calls.map((call) => call[0]);
    expect(welcome.to).toBe('ravi@example.com');
    expect(welcome.text).toContain('Sai Xerox');
    expect(welcome.text).toContain('https://app.printsetu.test/login');
    expect(adminMail.to).toEqual(['admin@printsetu.local']);
    for (const part of [
      'Sai Xerox',
      'Ravi Kumar Patel',
      'ravi@example.com',
      '9000000000',
      'Main Road, Surat',
      '25 Sept 2026',
    ]) {
      expect(adminMail.text).toContain(part);
    }
    expect(adminMail.text).toContain('https://app.printsetu.test/admin/shops');
    for (const message of [welcome, adminMail]) {
      expect(message.text).not.toContain('StrongPass123');
      expect(message.html).not.toContain('StrongPass123');
    }
  });

  it('still signs the owner in when an email fails to send', async () => {
    mail.send.mockRejectedValue(new Error('smtp down'));

    await expect(service.register(dto, {})).resolves.toEqual({ ...tokens, shopId: 'shop-1' });
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
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );

    await expect(service.register(dto, {})).rejects.toThrow(EmailAlreadyRegisteredException);
    expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-1');
  });
});
