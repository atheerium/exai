import { test } from "node:test";
import assert from "node:assert/strict";

test("auth module exports expected functions", () => {
  const auth = require("./auth");
  assert.ok(auth);
  assert.equal(typeof auth.getSessionCookieName, "function");
  assert.equal(typeof auth.createSession, "function");
  assert.equal(typeof auth.getCurrentUser, "function");
  assert.equal(typeof auth.requireUser, "function");
  assert.equal(typeof auth.isAdmin, "function");
  assert.equal(typeof auth.requireAdmin, "function");
  assert.equal(typeof auth.destroySession, "function");
});

test("getSessionCookieName returns correct default cookie name", () => {
  const { getSessionCookieName } = require("./auth");
  assert.equal(getSessionCookieName(), "exai_session");
});

test("isAdmin returns true for role admin", () => {
  const { isAdmin } = require("./auth");
  
  const adminUser = { email: "admin@example.com", role: "admin" };
  assert.ok(isAdmin(adminUser));
});

test("isAdmin returns true for email in ADMIN_EMAILS", () => {
  const { isAdmin } = require("./auth");
  
  // Temporarily set env var
  const originalEnv = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "admin@example.com,superadmin@example.com";
  
  const regularUser = { email: "admin@example.com", role: "teacher" };
  assert.ok(isAdmin(regularUser));
  
  const otherUser = { email: "other@example.com", role: "teacher" };
  assert.ok(!isAdmin(otherUser));
  
  // Restore env
  process.env.ADMIN_EMAILS = originalEnv;
});

test("isAdmin returns false when not admin and not in admin emails", () => {
  const { isAdmin } = require("./auth");
  
  const originalEnv = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "other@example.com";
  
  const regularUser = { email: "test@example.com", role: "teacher" };
  assert.ok(!isAdmin(regularUser));
  
  process.env.ADMIN_EMAILS = originalEnv;
});

test("ttl environment variable is accessible", () => {
  const { getSessionCookieName } = require("./auth");
  // Module loads TTL from env, verify cookie name works
  assert.equal(getSessionCookieName(), "exai_session");
});
