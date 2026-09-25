import { EmailOtpService, OTP_MAX_ATTEMPTS } from './email-otp.service';
import {
  EmailSendFailedException,
  InvalidOtpException,
  OtpResendTooSoonException,
} from '../common/exceptions/app.exceptions';

describe('EmailOtpService (emailed 6-digit codes)', () => {
  let prisma: any;
  let mail: { send: jest.Mock };
  let service: EmailOtpService;
  let rows: Map<string, any>;
  const build = (code: string, minutes: number) => ({
    to: 'ravi@example.com',
    subject: 'code',
    text: `code is: ${code} for ${minutes}`,
    html: '',
  });

  beforeEach(() => {
    rows = new Map();
    const keyOf = (where: any) => {
      const k = where.purpose_email ?? where;
      return `${k.purpose}:${k.email}`;
    };
    prisma = {
      emailVerification: {
        findUnique: jest.fn(async ({ where }: any) => rows.get(keyOf(where)) ?? null),
        upsert: jest.fn(async ({ where, create }: any) => rows.set(keyOf(where), { ...create })),
        update: jest.fn(async ({ where, data }: any) => {
          rows.get(keyOf(where)).attempts += data.attempts.increment;
        }),
        delete: jest.fn(async ({ where }: any) => rows.delete(keyOf(where))),
        deleteMany: jest.fn(async ({ where }: any) => rows.delete(keyOf(where))),
      },
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new EmailOtpService(prisma, mail as any);
  });

  const sentCode = (): string => /code is: (\d{6})/.exec(mail.send.mock.calls.at(-1)[0].text)![1];
  const row = (purpose = 'REGISTRATION') => rows.get(`${purpose}:ravi@example.com`);

  it('emails a 6-digit code valid for 10 minutes and stores only its hash', async () => {
    const result = await service.send('REGISTRATION', 'ravi@example.com', build);

    expect(result).toEqual({ expiresInSeconds: 600, resendAfterSeconds: 60 });
    const code = sentCode();
    expect(mail.send.mock.calls[0][0].text).toContain('for 10');
    expect(row().codeHash).not.toContain(code);
    expect(row().expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  });

  it('accepts the right code and rejects a wrong one', async () => {
    await service.send('REGISTRATION', 'ravi@example.com', build);
    const code = sentCode();
    const wrong = code === '000000' ? '111111' : '000000';

    await expect(service.verify('REGISTRATION', 'ravi@example.com', wrong)).rejects.toThrow(
      InvalidOtpException,
    );
    await expect(service.verify('REGISTRATION', 'ravi@example.com', code)).resolves.toBeUndefined();
  });

  it('keeps codes for different purposes apart', async () => {
    await service.send('REGISTRATION', 'ravi@example.com', build);
    const code = sentCode();

    await expect(service.verify('PASSWORD_RESET', 'ravi@example.com', code)).rejects.toThrow(
      InvalidOtpException,
    );
    // A reset code can be asked for straight away, without waiting out the registration code's timer.
    await expect(service.send('PASSWORD_RESET', 'ravi@example.com', build)).resolves.toBeDefined();
  });

  it('rejects an expired code', async () => {
    await service.send('REGISTRATION', 'ravi@example.com', build);
    const code = sentCode();
    row().expiresAt = new Date(Date.now() - 1000);

    await expect(service.verify('REGISTRATION', 'ravi@example.com', code)).rejects.toThrow(
      'expired',
    );
  });

  it('stops accepting even the right code after too many wrong tries', async () => {
    await service.send('REGISTRATION', 'ravi@example.com', build);
    const code = sentCode();
    row().attempts = OTP_MAX_ATTEMPTS;

    await expect(service.verify('REGISTRATION', 'ravi@example.com', code)).rejects.toThrow(
      'Too many wrong codes',
    );
  });

  it('rejects when no code was ever sent, and after the code was used', async () => {
    await expect(service.verify('REGISTRATION', 'ravi@example.com', '123456')).rejects.toThrow(
      InvalidOtpException,
    );

    await service.send('REGISTRATION', 'ravi@example.com', build);
    const code = sentCode();
    await service.consume('REGISTRATION', 'ravi@example.com');
    await expect(service.verify('REGISTRATION', 'ravi@example.com', code)).rejects.toThrow(
      InvalidOtpException,
    );
  });

  it('makes the user wait a minute between resends, then replaces the code', async () => {
    await service.send('REGISTRATION', 'ravi@example.com', build);
    await expect(service.send('REGISTRATION', 'ravi@example.com', build)).rejects.toThrow(
      OtpResendTooSoonException,
    );

    row().sentAt = new Date(Date.now() - 61_000);
    row().attempts = 3;
    await service.send('REGISTRATION', 'ravi@example.com', build);
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(row().attempts).toBe(0);
  });

  it('drops the code and reports it when the email cannot be sent, so the user can retry at once', async () => {
    mail.send.mockRejectedValue(new Error('smtp down'));

    await expect(service.send('REGISTRATION', 'ravi@example.com', build)).rejects.toThrow(
      EmailSendFailedException,
    );
    expect(row()).toBeUndefined();
  });
});
