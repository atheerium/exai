import { NextRequest, NextResponse } from "next/server";
import { destroySession, requireCsrf } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req.headers);
  } catch {
    return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
