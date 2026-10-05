// Pluggable mailer for account emails (PRD section 6 password recovery).
//
// Fail-closed in production: if no SMTP transport is wired, sending throws
// instead of silently dropping the email. The reset URL is never logged or
// returned in production (only the recipient address is logged so secrets
// never hit stdout / log dashboards). Outside production the API returns
// `devUrl` so the flow is fully usable and testable without an SMTP
// provider. Wire a real SMTP transport here before public launch (README
// notes this as a launch-blocking item).

import nodemailer from "nodemailer";

export function resetPasswordUrl(token: string): string {
  const base = (
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
  return `${base}/reset-password?token=${token}`;
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name?: string | null;
  url: string;
}): Promise<{ devUrl?: string }> {
  // Log target only (not the reset URL containing the token) so secrets
  // never hit stdout / log dashboards.
  console.log(`[mailer] password reset email queued for ${opts.to}`);

  if (process.env.NODE_ENV !== "production") {
    return { devUrl: opts.url };
  }

  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost || smtpHost.trim() === "") {
    throw new Error("Email delivery is not configured. Password reset cannot be completed.");
  }

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  const transport = nodemailer.createTransport({
    host: smtpHost.trim(),
    port,
    secure,
    auth:
      process.env.SMTP_USER || process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER || undefined,
            pass: process.env.SMTP_PASS || undefined,
          }
        : undefined,
  });

  const from =
    process.env.SMTP_FROM || "Exaai <no-reply@exaai.app>";

  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: "Reset your Exaai password",
      text: `You requested a password reset. Use this link to reset your password:\n\n${opts.url}\n\nIf you did not request this, ignore this email.`,
      html: `<p>You requested a password reset.</p><p><a href="${opts.url}">Reset your password</a></p><p>If you did not request this, ignore this email.</p>`,
    });
  } catch (e: any) {
    console.error(`[mailer] SMTP send failed for ${opts.to}: ${e?.message ?? e}`);
    throw new Error("Failed to send password reset email.");
  }

  return {};
}
