import { MailMessage } from './mail.service';

/**
 * The emails PrintSetu sends, as plain text plus a simple HTML version.
 * Never put a password in any of them.
 */

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#4338ca">PrintSetu</p>
<h1 style="margin:0 0 16px;font-size:18px">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr></table>
</body></html>`;
}

function detailsTable(rows: [string, string][]): string {
  return `<table role="presentation" style="border-collapse:collapse;margin:8px 0 20px;font-size:14px">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#475569;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:0 0 20px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(label)}</a></p>`;
}

export function registrationOtpEmail(to: string, code: string, validMinutes: number): MailMessage {
  return {
    to,
    subject: `${code} is your PrintSetu verification code`,
    text: [
      `Your PrintSetu verification code is: ${code}`,
      '',
      `Enter this code on the registration screen to finish creating your shop. It works for ${validMinutes} minutes.`,
      '',
      "If you didn't try to register a shop on PrintSetu, you can ignore this email.",
    ].join('\n'),
    html: layout(
      'Verify your email',
      `<p style="margin:0 0 12px">Enter this code on the registration screen to finish creating your shop:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px">${escapeHtml(code)}</p>
<p style="margin:0 0 12px">The code works for ${validMinutes} minutes.</p>
<p style="margin:0;color:#475569;font-size:13px">If you didn't try to register a shop on PrintSetu, you can ignore this email.</p>`,
    ),
  };
}

export function welcomeEmail(p: {
  to: string;
  ownerName: string;
  shopName: string;
  loginUrl: string;
}): MailMessage {
  return {
    to: p.to,
    subject: `Welcome to PrintSetu, ${p.shopName}`,
    text: [
      `Hello ${p.ownerName},`,
      '',
      'Your shop is now registered on PrintSetu.',
      '',
      `Shop name: ${p.shopName}`,
      `Sign-in email: ${p.to}`,
      `Sign in here: ${p.loginUrl}`,
      '',
      'Sign in with the password you chose while registering. If you forget it, use "Forgot password?" on the sign-in screen.',
      '',
      'Thank you for choosing PrintSetu.',
    ].join('\n'),
    html: layout(
      `Welcome to PrintSetu, ${p.ownerName}`,
      `<p style="margin:0 0 8px">Your shop is now registered. Here are your account details:</p>
${detailsTable([
  ['Shop name', p.shopName],
  ['Sign-in email', p.to],
])}
${button(p.loginUrl, 'Sign in to PrintSetu')}
<p style="margin:0 0 12px">Sign in with the password you chose while registering. If you forget it, use "Forgot password?" on the sign-in screen.</p>
<p style="margin:0">Thank you for choosing PrintSetu.</p>`,
    ),
  };
}

export function newShopAdminEmail(p: {
  to: string[];
  shopName: string;
  ownerName: string;
  email: string;
  mobile: string;
  address: string;
  registeredAt: string;
  adminUrl: string;
}): MailMessage {
  const rows: [string, string][] = [
    ['Shop name', p.shopName],
    ['Owner name', p.ownerName],
    ['Email', p.email],
    ['Mobile', p.mobile],
    ['Address', p.address],
    ['Registered on', p.registeredAt],
  ];
  return {
    to: p.to,
    subject: `New shop registered: ${p.shopName}`,
    text: [
      'A new shop has registered on PrintSetu.',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      `Open the Admin panel: ${p.adminUrl}`,
    ].join('\n'),
    html: layout(
      'New shop registered',
      `<p style="margin:0 0 8px">A new shop has registered on PrintSetu.</p>
${detailsTable(rows)}
${button(p.adminUrl, 'Open the Admin panel')}`,
    ),
  };
}

export function passwordResetOtpEmail(to: string, code: string, validMinutes: number): MailMessage {
  return {
    to,
    subject: `${code} is your PrintSetu password reset code`,
    text: [
      `Your PrintSetu password reset code is: ${code}`,
      '',
      `Enter this code on the sign-in screen to choose a new password. It works for ${validMinutes} minutes.`,
      '',
      "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    ].join('\n'),
    html: layout(
      'Reset your password',
      `<p style="margin:0 0 12px">Enter this code on the sign-in screen to choose a new password:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px">${escapeHtml(code)}</p>
<p style="margin:0 0 12px">The code works for ${validMinutes} minutes.</p>
<p style="margin:0;color:#475569;font-size:13px">If you didn't ask to reset your password, you can ignore this email. Your password stays the same.</p>`,
    ),
  };
}

export function passwordChangedEmail(p: {
  to: string;
  name: string;
  changedAt: string;
  loginUrl: string;
}): MailMessage {
  return {
    to: p.to,
    subject: 'Your PrintSetu password was changed',
    text: [
      `Hello ${p.name},`,
      '',
      `The password for your PrintSetu account (${p.to}) was changed on ${p.changedAt}.`,
      '',
      "If this was you, there's nothing more to do.",
      `If it wasn't you, reset your password right away with "Forgot password?" at ${p.loginUrl} and tell the PrintSetu admin.`,
    ].join('\n'),
    html: layout(
      'Your password was changed',
      `<p style="margin:0 0 12px">Hello ${escapeHtml(p.name)},</p>
<p style="margin:0 0 12px">The password for your PrintSetu account (<b>${escapeHtml(p.to)}</b>) was changed on ${escapeHtml(p.changedAt)}.</p>
<p style="margin:0 0 12px">If this was you, there's nothing more to do.</p>
<p style="margin:0 0 20px">If it wasn't you, reset your password right away with "Forgot password?" on the sign-in screen and tell the PrintSetu admin.</p>
${button(p.loginUrl, 'Go to sign in')}`,
    ),
  };
}
