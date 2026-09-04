import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/password-reset";
import { track } from "@/lib/events";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    // Always return 200 to avoid leaking which emails have accounts.
    const result = await requestPasswordReset(body.email);
    await track("password_reset_requested", { userId: undefined });
    return NextResponse.json(result);
  } catch (e: any) {
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    const msg = e?.message ?? "";
    // Validation errors (email format, rate limit) should be 400, not 500
    if (/valid email|email address|too many|permanent email/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[forgot-password]", e);
    return NextResponse.json({ error: "Could not process the request." }, { status: 500 });
  }
}
