import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'pomona_admin';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 20;

// Slows down password guessing. Existing logged-in sessions are not affected.
let failures: number[] = [];

function sameText(a: string, b: string): boolean {
  const hash = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(hash(a), hash(b));
}

function sign(expires: string, password: string): string {
  return createHmac('sha256', password).update(`admin:${expires}`).digest('hex');
}

export function loginIsConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function loginIsLocked(): boolean {
  const cutoff = Date.now() - FAILURE_WINDOW_MS;
  failures = failures.filter((time) => time > cutoff);
  return failures.length >= MAX_FAILURES;
}

/** Checks the password and starts a session. The password comes only from Railway's variables. */
export async function logIn(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !sameText(password, expected)) {
    failures.push(Date.now());
    return false;
  }
  const expires = String(Date.now() + SESSION_MS);
  (await cookies()).set(COOKIE_NAME, `${expires}.${sign(expires, expected)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
  return true;
}

export async function logOut(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAdmin(): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!expected || !value) return false;
  const [expires, signature] = value.split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return sameText(signature, sign(expires, expected));
}
