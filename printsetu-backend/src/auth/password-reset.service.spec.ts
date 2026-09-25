import { PasswordResetService } from './password-reset.service';
import { InvalidOtpException } from '../common/exceptions/app.exceptions';

describe('PasswordResetService ("Forgot password?")', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 300, tokenType: 'Bearer' };
  const sent = { expiresInSeconds: 600, resendAfterSeconds: 60 };
  const activeUser = {
    id: 'user-1',
    name: 'Ravi',
    shopId: 'shop-1',
    keycloakUserId: 'kc-1',
    status: 'ACTIVE',
  };

  let prisma: any;
  let otp: { send: jest.Mock; sentResponse: jest.Mock; verify: jest.Mock; consume: jest.Mock };
  let keycloakAdmin: { setPassword: jest.Mock };
  let usersService: { clearPendingPasswordChange: jest.Mock };
  let authService: { signIn: jest.Mock };
  let audit: { log: jest.Mock };
  let mail: { send: jest.Mock };
  let service: PasswordResetService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn().mockResolvedValue(activeUser) } };
    otp = {
      send: jest.fn().mockResolvedValue(sent),
      sentResponse: jest.fn().mockReturnValue(sent),
      verify: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
    };
    keycloakAdmin = { setPassword: jest.fn().mockResolvedValue(undefined) };
    usersService = { clearPendingPasswordChange: jest.fn().mockResolvedValue(undefined) };
    authService = { signIn: jest.fn().mockResolvedValue(tokens) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    const settings: Record<string, unknown> = {
      appBaseUrl: 'https://app.printsetu.test',
      shopTimeZone: 'Asia/Kolkata',
    };
    service = new PasswordResetService(
      prisma,
      otp as any,
      keycloakAdmin as any,
      usersService as any,
      authService as any,
      audit as any,
      mail as any,
      { get: jest.fn((key: string) => settings[key]) } as any,
    );
  });

  it('emails a reset code to an active account', async () => {
    await expect(service.sendCode(' Ravi@Example.com ')).resolves.toEqual(sent);

    expect(otp.send).toHaveBeenCalledWith(
      'PASSWORD_RESET',
      'ravi@example.com',
      expect.any(Function),
    );
    const message = otp.send.mock.calls[0][2]('654321', 10);
    expect(message.to).toBe('ravi@example.com');
    expect(message.subject).toContain('password reset code');
    expect(message.text).toContain('654321');
  });

  it.each([
    ['no account', null],
    ['a turned-off account', { ...activeUser, status: 'DISABLED' }],
  ])('answers "code sent" for %s without sending anything', async (_label, user) => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(service.sendCode('ravi@example.com')).resolves.toEqual(sent);
    expect(otp.send).not.toHaveBeenCalled();
  });

  it('sets the new password, clears any temporary one, uses up the code and signs in', async () => {
    const result = await service.reset('Ravi@Example.com', '123456', 'NewStrong123', {
      ip: '1.2.3.4',
    });

    expect(otp.verify).toHaveBeenCalledWith('PASSWORD_RESET', 'ravi@example.com', '123456');
    expect(keycloakAdmin.setPassword).toHaveBeenCalledWith('kc-1', 'NewStrong123', false);
    expect(usersService.clearPendingPasswordChange).toHaveBeenCalledWith('user-1');
    expect(otp.consume).toHaveBeenCalledWith('PASSWORD_RESET', 'ravi@example.com');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET', actorUserId: 'user-1' }),
    );
    expect(authService.signIn).toHaveBeenCalledWith('ravi@example.com', 'NewStrong123');
    expect(result).toEqual(tokens);
  });

  it('emails a "password changed" notice without the password', async () => {
    await service.reset('ravi@example.com', '123456', 'NewStrong123', {});
    await new Promise((resolve) => setImmediate(resolve));

    const notice = mail.send.mock.calls[0][0];
    expect(notice.to).toBe('ravi@example.com');
    expect(notice.subject).toBe('Your PrintSetu password was changed');
    expect(notice.text + notice.html).not.toContain('NewStrong123');
  });

  it('changes nothing when the code is wrong', async () => {
    otp.verify.mockRejectedValue(new InvalidOtpException());

    await expect(service.reset('ravi@example.com', '000000', 'NewStrong123', {})).rejects.toThrow(
      InvalidOtpException,
    );
    expect(keycloakAdmin.setPassword).not.toHaveBeenCalled();
    expect(authService.signIn).not.toHaveBeenCalled();
  });

  it('gives an unknown email the same "wrong code" answer', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.reset('nobody@example.com', '123456', 'NewStrong123', {})).rejects.toThrow(
      InvalidOtpException,
    );
    expect(otp.verify).not.toHaveBeenCalled();
    expect(keycloakAdmin.setPassword).not.toHaveBeenCalled();
  });
});
