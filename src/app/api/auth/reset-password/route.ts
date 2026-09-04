import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/password-reset";
import { track } from "@/lib/events";

const schema = z.object({ token: z.string().min(16), password: z.string().min(6) });

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    await resetPassword(body.token, body.password);
    await track("password_reset_completed");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    const msg: string = e?.message ?? "";
    if (/reset link|expired|already been used|password|at least 6 characters/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[reset-password]", e);
    return NextResponse.json({ error: "Could not reset the password." }, { status: 500 });
  }
}
