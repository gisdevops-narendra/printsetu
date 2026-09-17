export interface DecodedAccessToken {
  sub: string;
  email: string;
  preferred_username: string;
  name?: string;
  realm_access?: { roles: string[] };
  exp: number;
}

/** Decodes the JWT payload only — signature verification happens server-side on every request. */
export function decodeJwt<T = DecodedAccessToken>(token: string): T | null {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
