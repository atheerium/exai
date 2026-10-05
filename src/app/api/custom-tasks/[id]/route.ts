import { NextRequest, NextResponse } from "next/server";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;
    const deleted = await withRls(user.id, async (tx) => {
      const item = await tx.customTask.findFirst({ where: { id, userId: user.id } });
      if (!item) return false;
      await tx.customTask.delete({ where: { id } });
      return true;
    });
    if (!deleted) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    return NextResponse.json({ error: "Could not delete custom task." }, { status: 500 });
  }
}
