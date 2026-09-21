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
  // Log target only (not the reset URL containing the token) so secrets
  // never hit stdout / log dashboards.
  console.log(`[mailer] password reset email queued for ${opts.to}`);
  if (process.env.NODE_ENV !== "production") {
    return { devUrl: opts.url };
  }
  // Production: never expose the token URL in API responses or logs.
  if (!process.env.SMTP_HOST) {
    console.warn("[mailer] SMTP_HOST not configured — reset queued but not delivered (production)");
  } else {
    console.warn("[mailer] SMTP transport not yet wired — reset queued but not delivered (production)");
  }
  return {};
}
