// Minimal in-memory login throttle (PRD section 29: suspicious authentication
// patterns). Sliding window of failures per key (ip + email); after `max`
// failures within `windowMs`, further attempts are rejected with a lockout for
// `lockMs`. Successful login clears the counter. Production deployments should
// swap this for a shared store (Redis) or an edge rate limiter.

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
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
