import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/**
 * Single-admin auth: one password from ADMIN_PASSWORD, a signed JWT in an
 * httpOnly cookie. Framework-free so it can be tested and used from the proxy.
 */

export const SESSION_COOKIE = "wc_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;
const AUDIENCE = "walletcast-admin";

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Constant-time compare that does not leak the password length. */
export function checkPassword(candidate: string, expected: string | null): boolean {
  if (!expected || !candidate) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function createSessionToken(secret: string, now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined, secret: string | null): Promise<boolean> {
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: AUDIENCE, algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
