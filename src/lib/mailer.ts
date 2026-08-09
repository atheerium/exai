// Pluggable mailer for account emails (PRD section 6 password recovery).
//
// Delivery: in every environment the reset URL is written to the server log
// (useful on PaaS where stdout is shipped to log dashboards). Outside
// production the API also returns `devUrl` so the flow is fully usable and
// testable without an SMTP provider. Wire a real SMTP transport here before
// public launch (README notes this as a launch-blocking item).

export function resetPasswordUrl(token: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/reset-password?token=${token}`;
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name?: string | null;
  url: string;
}): Promise<{ devUrl?: string }> {
  // Always log the delivery target (no password, no secret content).
  console.log(`[mailer] password reset for ${opts.to}: ${opts.url}`);
  if (process.env.NODE_ENV !== "production") {
    return { devUrl: opts.url };
  }
  // Production: a real transport must be configured; fail loudly rather than
  // silently pretending the email was sent.
  if (!process.env.SMTP_HOST) {
    throw new Error("SMTP_HOST is not configured; password reset email cannot be sent.");
  }
  // TODO(deployment): implement the SMTP transport (e.g. nodemailer) before launch.
  throw new Error("SMTP transport is not yet wired; configure before enabling production resets.");
}
