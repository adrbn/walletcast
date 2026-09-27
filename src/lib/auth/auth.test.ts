import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, SESSION_TTL_SECONDS, sessionCookieOptions, verifySessionToken } from "./session";
import { clientIp, createRateLimiter } from "@/lib/http/rateLimit";

const secret = "s".repeat(32);

describe("admin session", () => {
  it("checks the password", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("hunter3", "hunter2")).toBe(false);
    expect(checkPassword("", "hunter2")).toBe(false);
    expect(checkPassword("x", null)).toBe(false);
  });

  it("round-trips a session token", async () => {
    const token = await createSessionToken(secret);
    expect(await verifySessionToken(token, secret)).toBe(true);
    expect(await verifySessionToken(token, "o".repeat(32))).toBe(false);
    expect(await verifySessionToken(undefined, secret)).toBe(false);
    expect(await verifySessionToken("garbage", secret)).toBe(false);
    expect(await verifySessionToken(token, null)).toBe(false);
  });

  it("expires tokens", async () => {
    const old = await createSessionToken(secret, new Date(Date.now() - (SESSION_TTL_SECONDS + 60) * 1000));
    expect(await verifySessionToken(old, secret)).toBe(false);
  });

  it("builds secure cookie options", () => {
    expect(sessionCookieOptions(true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a"), rl.hit("b")]).toEqual([true, true, false, true]);
    t = 1000;
    expect(rl.hit("a")).toBe(true);
  });

  it("reads the client ip", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
