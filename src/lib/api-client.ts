// Browser fetch wrapper that attaches the CSRF token for mutating requests.
//
// The server sets a non-httpOnly `csrf_token` cookie on session creation
// (see createSession in src/lib/auth.ts) and requires it back as the
// `X-CSRF-Token` header via requireCsrf. This helper reads the cookie and
// adds the header automatically for non-GET/HEAD/OPTIONS requests.
//
// SSR-safe: `document` is guarded so importing this module on the server
// never throws. Before login (no cookie yet) the header is simply skipped.

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name === "csrf_token") {
      return decodeURIComponent(part.slice(idx + 1));
    }
  }
  return null;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return fetch(path, init);
  }
  const token = getCsrfToken();
  if (!token) return fetch(path, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", token);
  }
  return fetch(path, { ...init, headers });
}
