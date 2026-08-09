import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { captureRevision, restoreRevision } from "@/lib/revisions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    const revisions = await prisma.examRevision.findMany({
      where: { examId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, createdAt: true },
    });
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
    const user = await requireUser();
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    const body = (await req.json()) as { label?: string };
    await captureRevision(id, body.label?.trim() || "Manual checkpoint");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not save a checkpoint." }, { status: 500 });
  }
}
