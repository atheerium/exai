// Minimal in-memory login throttle (PRD section 29: suspicious authentication
// patterns). WARNING: this is per-process memory only; it does NOT work
// reliably on serverless (Vercel) or multi-instance deployments. Replace with
// Redis / edge rate limiter before production scale.
// Sliding window of failures per key (ip + email); after `max`
// failures within `windowMs`, further attempts are rejected with a lockout for
// `lockMs`. Successful login clears the counter.

export interface LoginThrottleOptions {
  max: number;
  windowMs: number;
  lockMs: number;
  now?: () => number;
}

export interface LoginThrottle {
  check(key: string): { allowed: boolean; retryAfterMs: number };
  recordFailure(key: string): void;
  clear(key: string): void;
}

export function createLoginThrottle(opts: LoginThrottleOptions): LoginThrottle {
  const now = opts.now ?? Date.now;
  const failures = new Map<string, number[]>();

  return {
    check(key: string) {
      const t = now();
      const list = (failures.get(key) ?? []).filter((ts) => t - ts < opts.windowMs);
      failures.set(key, list);
      if (list.length < opts.max) return { allowed: true, retryAfterMs: 0 };
      const retryAfterMs = Math.max(opts.lockMs, opts.windowMs - (t - list[0]));
      return { allowed: false, retryAfterMs };
    },
    recordFailure(key: string) {
      const t = now();
      const list = (failures.get(key) ?? []).filter((ts) => t - ts < opts.windowMs);
      list.push(t);
      failures.set(key, list);
    },
    clear(key: string) {
      failures.delete(key);
    },
  };
}

export const loginThrottle = createLoginThrottle({
  max: 5,
  windowMs: 15 * 60 * 1000,
  lockMs: 60 * 1000,
});

export function clientIp(headers: Headers): string {
  // WARNING: serverless/multi-instance deployments share no memory; this Map
  // resets per process and per deploy. In production, replace with Redis or an
  // edge rate limiter. Also, x-forwarded-for is client-spoofable; in production
  // verify against a trusted proxy allow-list before using. We take the LAST
  // comma-separated entry (the one appended by the trusted proxy) rather than
  // the first, which can be spoofed by the client.
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip") ?? "unknown";
}

// Per-IP login throttle (independent of email): catches attackers rotating
// many victim emails from a single source IP. Backed by the same in-memory
// store as loginThrottle; per the warning above, replace with Redis/edge
// rate limiter for production scale.
export const ipLoginThrottle = createLoginThrottle({
  max: 5,
  windowMs: 15 * 60 * 1000,
  lockMs: 60 * 1000,
});

// Per-IP registration throttle: 10 attempts per hour per IP to prevent
// registration spam / credential-stuffing account-creation bursts.
export const registerThrottle = createLoginThrottle({
  max: 10,
  windowMs: 60 * 60 * 1000,
  lockMs: 60 * 60 * 1000,
});
