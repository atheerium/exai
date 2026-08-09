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
    return NextResponse.json({ error: "Could not process the request." }, { status: 500 });
  }
}
