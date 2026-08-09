import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail, resetPasswordUrl } from "@/lib/mailer";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Always resolves successfully for existing accounts; for unknown emails it
// performs the same work so response timing does not leak account existence.
export async function requestPasswordReset(email: string): Promise<{ ok: true; devUrl?: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return { ok: true };
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
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new Error("This reset link is invalid or has expired. Request a new one.");
  }
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Invalidate existing sessions after a password change.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  return { ok: true };
}
