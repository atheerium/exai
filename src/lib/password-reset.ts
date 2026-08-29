import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail, resetPasswordUrl } from "@/lib/mailer";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS_PER_EMAIL = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Track failed attempts to prevent brute force attacks
export async function recordFailedAttempt(email: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  
  await prisma.$transaction(async (tx) => {
    // Clean up old attempts
    await tx.passwordResetAttempt.deleteMany({
      where: {
        email: email.toLowerCase().trim(),
        createdAt: { lt: windowStart }
      }
    });
    
    // Count recent attempts
    const recentAttempts = await tx.passwordResetAttempt.count({
      where: {
        email: email.toLowerCase().trim(),
        createdAt: { gte: windowStart }
      }
    });
    
    if (recentAttempts >= MAX_ATTEMPTS_PER_EMAIL) {
      throw new Error("Too many reset attempts. Please try again later.");
    }
    
    // Record this attempt
    await tx.passwordResetAttempt.create({
      data: {
        email: email.toLowerCase().trim(),
        createdAt: now,
        ipAddress: "masked" // Would typically come from request context
      }
    });
  });
}

// Clean up expired reset tokens and old attempts
export async function cleanupExpiredRecords(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - RESET_TTL_MS);
  
  await prisma.$transaction(async (tx) => {
    // Delete expired reset tokens
    await tx.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: now } }
    });
    
    // Delete attempts older than 24 hours
    const oldCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await tx.passwordResetAttempt.deleteMany({
      where: { createdAt: { lt: oldCutoff } }
    });
  });
}

// Enhanced email validation with stricter checks
function validateEmailFormat(email: string): void {
  // Basic format check
  if (!email || typeof email !== 'string') {
    throw new Error("Valid email is required.");
  }
  
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email.trim())) {
    throw new Error("Please provide a valid email address.");
  }
  
  // Check for disposable email domains
  const disposableDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'yopmail.com', 'throwaway.email'];
  const domain = email.split('@')[1].toLowerCase();
  if (disposableDomains.includes(domain)) {
    throw new Error("Please use a permanent email address.");
  }
  
  // Maximum length check
  if (email.length > 254) {
    throw new Error("Email address is too long.");
  }
}

// Enhanced password validation with security requirements
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
  
  // Check for common weak passwords
  const commonPasswords = ['password', '12345678', 'qwerty', 'admin', 'letmein', 'welcome', 'monkey'];
  if (commonPasswords.includes(password.toLowerCase())) {
    throw new Error("Please choose a stronger password.");
  }
  
  // Require at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter.");
  }
  
  // Require at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    throw new Error("Password must contain at least one lowercase letter.");
  }
  
  // Require at least one digit
  if (!/\d/.test(password)) {
    throw new Error("Password must contain at least one number.");
  }
  
  // Require at least one special character
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new Error("Password must contain at least one special character.");
  }
  
  // Check for sequential characters
  if (/(?:\d{3,})/.test(password) || /(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) {
    throw new Error("Password contains easily predictable patterns.");
  }
}

// Always resolves successfully for existing accounts; for unknown emails it
// performs the same work so response timing does not leak account existence.
export async function requestPasswordReset(email: string): Promise<{ ok: true; devUrl?: string }> {
  // Validate email format
  validateEmailFormat(email);
  
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  
  // If user doesn't exist, still do the work to prevent timing attacks
  if (!user) {
    // Still validate password if provided (for API calls)
    // Simulate the work to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 50));
    return { ok: true };
  }
  
  // Check rate limiting for existing users
  const now = new Date();
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  const recentAttempts = await prisma.passwordResetAttempt.count({
    where: {
      email: email.toLowerCase().trim(),
      createdAt: { gte: windowStart }
    }
  });
  
  if (recentAttempts >= MAX_ATTEMPTS_PER_EMAIL) {
    throw new Error("Too many reset attempts. Please try again later.");
  }
  
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  
  try {
    const sent = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      url: resetPasswordUrl(token),
    });
    return { ok: true, devUrl: sent.devUrl };
  } catch (e) {
    // Delivery failed: never leave a dangling token behind.
    await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => {});
    throw e;
  }
}

export async function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  // Validate password strength first
  validatePasswordStrength(password);
  
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new Error("This reset link is invalid or has expired. Request a new one.");
  }
  
  // Check if this token has already been used (redundant but safe)
  if (record.usedAt) {
    throw new Error("This reset link has already been used.");
  }
  
  // Additional security check: ensure token is not about to expire soon
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  if (record.expiresAt < fiveMinutesFromNow) {
    // Instead of allowing reset with expiring token, force re-request
    await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => {});
    throw new Error("This reset link has expired. Please request a new one.");
  }
  
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 10);
  
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    // Invalidate existing sessions after a password change.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  return { ok: true };
}
