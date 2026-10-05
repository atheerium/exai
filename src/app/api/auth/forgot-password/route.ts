import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
// NOTE: unauthenticated recovery flows intentionally skip CSRF — there is no
// authenticated session to protect yet, and requiring a token would block
// logged-out users from recovering access.
import { requestPasswordReset } from "@/lib/password-reset";
import { clientIp } from "@/lib/rate-limit";
import { track } from "@/lib/events";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    // Always return 200 to avoid leaking which emails have accounts.
    // Never expose reset links to clients; only acknowledge the request.
    await requestPasswordReset(body.email, clientIp(req.headers));
    await track("password_reset_requested", { userId: undefined });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    const msg = e?.message ?? "";
    // Validation errors (email format, rate limit) should be 400, not 500
    if (/valid email|email address|too many|permanent email/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[forgot-password]", e);
    if (/not configured|cannot be completed/i.test(msg)) {
      return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not process the request." }, { status: 500 });
  }
}
