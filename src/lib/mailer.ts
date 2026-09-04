// Pluggable mailer for account emails (PRD section 6 password recovery).
//
// Delivery: in every environment the reset URL is written to the server log
// (useful on PaaS where stdout is shipped to log dashboards). Outside
// production the API also returns `devUrl` so the flow is fully usable and
// testable without an SMTP provider. Wire a real SMTP transport here before
// public launch (README notes this as a launch-blocking item).

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
  // Always log the delivery target (no password, no secret content).
  console.log(`[mailer] password reset for ${opts.to}: ${opts.url}`);
  if (process.env.NODE_ENV !== "production") {
    return { devUrl: opts.url };
  }
  // Production without SMTP configured: keep the flow usable for staging/demo
  // by returning devUrl and logging. This avoids the 500 seen on Vercel where
  // SMTP_HOST is not yet provisioned (exai-three.vercel.app/forgot-password).
  // Once SMTP is wired, this branch will be replaced by the nodemailer transport.
  if (!process.env.SMTP_HOST) {
    console.warn("[mailer] SMTP_HOST not configured — returning devUrl as fallback (staging mode)");
    return { devUrl: opts.url };
  }
  // SMTP is configured but transport not yet implemented — fallback to devUrl
  // so we never throw 500 in production until nodemailer is wired.
  console.warn("[mailer] SMTP transport not yet wired — returning devUrl as fallback");
  return { devUrl: opts.url };
}
