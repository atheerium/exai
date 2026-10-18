// `apiFetch` is the only path by which a browser mutation reaches the API, and
// it is what attaches the CSRF header `requireCsrf` demands. It was untested:
// the module must be import-safe without a DOM, and the header must appear on
// mutating calls only.
//
// Tested through the public API with stubbed `document.cookie` and `fetch`,
// not by reaching into the private cookie reader.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { apiFetch } from "./api-client";

const realFetch = globalThis.fetch;

interface Call {
  path: string;
  init: RequestInit | undefined;
}

/** Sets a cookie string for the next call and records what `fetch` received. */
function stub(cookie: string | null) {
  const calls: Call[] = [];
  if (cookie === null) {
    delete (globalThis as any).document;
  } else {
    (globalThis as any).document = { cookie };
  }
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).document;
});

test("a POST carries the csrf_token cookie as X-CSRF-Token", async () => {
  const calls = stub("exai_session=abc; csrf_token=token-123");
  await apiFetch("/api/exams/1", { method: "POST" });
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("X-CSRF-Token"), "token-123");
});

test("the token is URL-decoded", async () => {
  const calls = stub("csrf_token=a%2Bb%3Dc");
  await apiFetch("/api/exams/1", { method: "PATCH" });
  assert.equal(new Headers(calls[0].init?.headers).get("X-CSRF-Token"), "a+b=c");
});

test("the token is found even when it is not the first cookie", async () => {
  const calls = stub("a=1; csrf_token=late; b=2");
  await apiFetch("/api/exams/1", { method: "DELETE" });
  assert.equal(new Headers(calls[0].init?.headers).get("X-CSRF-Token"), "late");
});

test("safe methods are never given a CSRF header", async () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    const calls = stub("csrf_token=token-123");
    await apiFetch("/api/exams/1", { method });
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get("X-CSRF-Token"), null, `${method} must not carry the header`);
  }
});

test("no cookie means the request is sent unchanged", async () => {
  const calls = stub("exai_session=abc");
  await apiFetch("/api/exams/1", { method: "POST" });
  assert.equal(new Headers(calls[0].init?.headers).get("X-CSRF-Token"), null);
});

test("a caller-supplied X-CSRF-Token is respected, not overwritten", async () => {
  const calls = stub("csrf_token=cookie-value");
  await apiFetch("/api/exams/1", { method: "POST", headers: { "X-CSRF-Token": "explicit" } });
  assert.equal(new Headers(calls[0].init?.headers).get("X-CSRF-Token"), "explicit");
});

test("apiFetch is import-safe with no document (server render)", async () => {
  const calls = stub(null);
  // No DOM: the header cannot be read, and the call must still go out.
  const res = await apiFetch("/api/exams/1", { method: "POST" });
  assert.equal(res.status, 200);
  assert.equal(new Headers(calls[0].init?.headers).get("X-CSRF-Token"), null);
});
