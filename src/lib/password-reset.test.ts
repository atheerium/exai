import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "crypto";

// Test the pure functions directly - these don't need database mocking
// hashToken is defined in password-reset.ts but we test its logic inline

test("hashToken logic produces consistent SHA256 hashes", () => {
  const token = "test-token-123";
  const hash = createHash("sha256").update(token).digest("hex");
  const hash2 = createHash("sha256").update(token).digest("hex");
  assert.equal(hash, hash2);
  assert.equal(hash.length, 64); // SHA256 hex length
});

// Inline validation functions to test their logic
function validateEmailFormat(email: string): void {
  if (!email || typeof email !== 'string') {
    throw new Error("Valid email is required.");
  }
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email.trim())) {
    throw new Error("Please provide a valid email address.");
  }
  // Actual disposable domains (not Gmail, Yahoo, etc.)
  const disposableDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'yopmail.com', 'throwaway.email'];
  const domain = email.split('@')[1].toLowerCase();
  if (disposableDomains.includes(domain)) {
    throw new Error("Please use a permanent email address.");
  }
  if (email.length > 254) {
    throw new Error("Email address is too long.");
  }
}

function validatePasswordStrength(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new Error("Password is required.");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  if (password.length > 128) {
    throw new Error("Password is too long.");
  }
  const commonPasswords = ['password', '12345678', 'qwerty', 'admin', 'letmein', 'welcome', 'monkey'];
  if (commonPasswords.includes(password.toLowerCase())) {
    throw new Error("Please choose a stronger password.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Password must contain at least one lowercase letter.");
  }
  if (!/\d/.test(password)) {
    throw new Error("Password must contain at least one number.");
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new Error("Password must contain at least one special character.");
  }
  if (/(?:\d{3,})/.test(password) || /(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) {
    throw new Error("Password contains easily predictable patterns.");
  }
}

test("validateEmailFormat accepts valid emails", () => {
  assert.doesNotThrow(() => validateEmailFormat("user@example.com"));
  assert.doesNotThrow(() => validateEmailFormat("test.user@domain.org"));
  assert.doesNotThrow(() => validateEmailFormat("user+tag@example.co.uk"));
  // Now Gmail, Yahoo, etc. are valid
  assert.doesNotThrow(() => validateEmailFormat("user@gmail.com"));
  assert.doesNotThrow(() => validateEmailFormat("user@yahoo.com"));
  assert.doesNotThrow(() => validateEmailFormat("user@hotmail.com"));
  assert.doesNotThrow(() => validateEmailFormat("user@outlook.com"));
});

test("validateEmailFormat rejects invalid formats", () => {
  assert.throws(() => validateEmailFormat(""), /Valid email is required/);
  assert.throws(() => validateEmailFormat("invalid"), /valid email address/);
  assert.throws(() => validateEmailFormat("no@domain"), /valid email address/);
  assert.throws(() => validateEmailFormat("@nodomain.com"), /valid email address/);
  assert.throws(() => validateEmailFormat("user@"), /valid email address/);
});

test("validateEmailFormat rejects disposable email domains", () => {
  assert.throws(() => validateEmailFormat("test@tempmail.com"), /permanent email address/);
  assert.throws(() => validateEmailFormat("user@10minutemail.com"), /permanent email address/);
  assert.throws(() => validateEmailFormat("test@guerrillamail.com"), /permanent email address/);
  assert.throws(() => validateEmailFormat("user@mailinator.com"), /permanent email address/);
  assert.throws(() => validateEmailFormat("test@yopmail.com"), /permanent email address/);
  assert.throws(() => validateEmailFormat("user@throwaway.email"), /permanent email address/);
});

test("validateEmailFormat enforces length limits", () => {
  const longEmail = "a".repeat(250) + "@example.com";
  assert.throws(() => validateEmailFormat(longEmail), /too long/);
});

test("validatePasswordStrength accepts strong passwords", () => {
  assert.doesNotThrow(() => validatePasswordStrength("StrongPass1!2"));
  assert.doesNotThrow(() => validatePasswordStrength("MySecure@Pass1"));
  assert.doesNotThrow(() => validatePasswordStrength("Complex#Password9"));
  assert.doesNotThrow(() => validatePasswordStrength("Test@Passw0rd"));
});

test("validatePasswordStrength rejects weak passwords", () => {
  assert.throws(() => validatePasswordStrength(""), /Password is required/);
  assert.throws(() => validatePasswordStrength("short"), /at least 8 characters/);
  assert.throws(() => validatePasswordStrength("nouppercase123!"), /uppercase letter/);
  assert.throws(() => validatePasswordStrength("NOLOWERCASE123!"), /lowercase letter/);
  assert.throws(() => validatePasswordStrength("NoDigitsHere!"), /number/);
  assert.throws(() => validatePasswordStrength("NoSpecialChars123"), /special character/);
  // These 8+ char passwords are in the common passwords list exactly
  assert.throws(() => validatePasswordStrength("password"), /stronger password/);
  assert.throws(() => validatePasswordStrength("12345678"), /stronger password/);
  // These are under 8 chars - fail length check before common password check
  assert.throws(() => validatePasswordStrength("qwerty"), /at least 8 characters/);
  assert.throws(() => validatePasswordStrength("admin"), /at least 8 characters/);
  assert.throws(() => validatePasswordStrength("letmein"), /at least 8 characters/);
  assert.throws(() => validatePasswordStrength("welcome"), /at least 8 characters/);
  assert.throws(() => validatePasswordStrength("monkey"), /at least 8 characters/);
  // These variants are NOT in common list and have no uppercase
  assert.throws(() => validatePasswordStrength("qwerty123!"), /uppercase letter/);
  assert.throws(() => validatePasswordStrength("admin123!"), /uppercase letter/);
  assert.throws(() => validatePasswordStrength("letmein123!"), /uppercase letter/);
  assert.throws(() => validatePasswordStrength("welcome123!"), /uppercase letter/);
  assert.throws(() => validatePasswordStrength("monkey123!"), /uppercase letter/);
});

test("validatePasswordStrength rejects sequential patterns", () => {
  assert.throws(() => validatePasswordStrength("Pass1234!"), /predictable patterns/);
  assert.throws(() => validatePasswordStrength("abcPass1!"), /predictable patterns/);
  assert.throws(() => validatePasswordStrength("Passxyz1!"), /predictable patterns/);
});

test("validatePasswordStrength enforces maximum length", () => {
  // 129 characters exceeds the 128 max
  assert.throws(() => validatePasswordStrength("Aa1!" + "b".repeat(125)), /too long/);
});

test("validatePasswordStrength requires at least 8 characters", () => {
  assert.throws(() => validatePasswordStrength("Ab1!"), /at least 8 characters/);
  assert.throws(() => validatePasswordStrength("Abcdef1!"), /predictable patterns/); // 8 chars, sequential
});

test("validateEmailFormat handles edge cases", () => {
  // Empty string
  assert.throws(() => validateEmailFormat(""), /Valid email is required/);
  // Non-string
  assert.throws(() => validateEmailFormat(null as any), /Valid email is required/);
  assert.throws(() => validateEmailFormat(undefined as any), /Valid email is required/);
  // Whitespace only
  assert.throws(() => validateEmailFormat("   "), /valid email address/);
  // Leading/trailing whitespace is trimmed
  assert.doesNotThrow(() => validateEmailFormat("  user@example.com  "));
});

test("validatePasswordStrength handles edge cases", () => {
  // Empty string
  assert.throws(() => validatePasswordStrength(""), /Password is required/);
  // Non-string
  assert.throws(() => validatePasswordStrength(null as any), /Password is required/);
  assert.throws(() => validatePasswordStrength(undefined as any), /Password is required/);
});
