/**
 * Fixed-window in-memory rate limiter. Good enough for a single instance;
 * on serverless each instance has its own window (documented limitation).
 */
export interface RateLimiter {
  /** Returns true when the call is allowed. */
  hit(key: string): boolean;
}

export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = options.now ?? Date.now;
  let windows = new Map<string, { start: number; count: number }>();

  return {
    hit(key) {
      const t = now();
      if (windows.size > 10_000) {
        windows = new Map([...windows].filter(([, w]) => t - w.start < options.windowMs));
      }
      const current = windows.get(key);
      if (!current || t - current.start >= options.windowMs) {
        windows.set(key, { start: t, count: 1 });
        return true;
      }
      windows.set(key, { start: current.start, count: current.count + 1 });
      return current.count + 1 <= options.limit;
    },
  };
}

/**
 * Client IP for rate limiting. Uses the right-most X-Forwarded-For entry:
 * the one appended by the proxy in front of us (Vercel, Caddy, nginx).
 * Left-most entries are client-controlled and trivially spoofed.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded?.length) return forwarded[forwarded.length - 1];
  return headers.get("x-real-ip") ?? "unknown";
}
