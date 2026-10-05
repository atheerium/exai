import { NextRequest, NextResponse } from "next/server";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { captureRevision } from "@/lib/revisions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const revisions = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id } });
      if (!exam) return null;
      return tx.examRevision.findMany({
        where: { examId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true, label: true, createdAt: true },
      });
    });
    if (!revisions) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json({
      revisions: revisions.map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt.toISOString() })),
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not load revisions." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as { label?: string };
    const saved = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id } });
      if (!exam) return false;
      await captureRevision(id, body.label?.trim() || "Manual checkpoint", tx);
      return true;
    });
    if (!saved) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not save a checkpoint." }, { status: 500 });
  }
}
