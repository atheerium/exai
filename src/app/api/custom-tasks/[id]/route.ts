import { NextRequest, NextResponse } from "next/server";
import { prisma, setRlsContext } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await setRlsContext(user.id);
    const { id } = await params;
    const item = await prisma.customTask.findFirst({ where: { id, userId: user.id } });
    if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await prisma.customTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Could not delete custom task." }, { status: 500 });
  }
}
