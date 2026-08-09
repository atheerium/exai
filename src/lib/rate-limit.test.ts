import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginThrottle } from "./rate-limit";

function makeThrottle(now: { t: number }) {
  return createLoginThrottle({ max: 5, windowMs: 1000, lockMs: 500, now: () => now.t });
}

test("allows attempts below the failure threshold", () => {
  const now = { t: 0 };
  const th = makeThrottle(now);
  for (let i = 0; i < 4; i++) {
    th.recordFailure("k");
    assert.equal(th.check("k").allowed, true);
  }
});

test("blocks the attempt after the max is reached", () => {
  const now = { t: 0 };
  const th = makeThrottle(now);
  for (let i = 0; i < 5; i++) th.recordFailure("k");
  const gate = th.check("k");
  assert.equal(gate.allowed, false);
  assert.ok(gate.retryAfterMs >= 500);
});

test("successful login clears the failure counter", () => {
  const now = { t: 0 };
  const th = makeThrottle(now);
  for (let i = 0; i < 5; i++) th.recordFailure("k");
  assert.equal(th.check("k").allowed, false);
  th.clear("k");
  assert.equal(th.check("k").allowed, true);
});

test("old failures expire outside the window", () => {
  const now = { t: 0 };
  const th = makeThrottle(now);
  for (let i = 0; i < 5; i++) th.recordFailure("k");
  now.t = 1500; // beyond windowMs
  assert.equal(th.check("k").allowed, true);
});

test("keys are isolated from each other", () => {
  const now = { t: 0 };
  const th = makeThrottle(now);
  for (let i = 0; i < 5; i++) th.recordFailure("a");
  assert.equal(th.check("a").allowed, false);
  assert.equal(th.check("b").allowed, true);
});
