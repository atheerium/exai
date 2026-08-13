import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, setRlsContext } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { restoreRevision } from "@/lib/revisions";
import { track } from "@/lib/events";

const schema = z.object({ revisionId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await setRlsContext(user.id);
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const body = schema.parse(await req.json());
    await restoreRevision(id, body.revisionId);
    await track("exam_revision_restored", { userId: user.id, examId: id });

    const dto = await loadExamDto(id, user.id);
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message === "NOT_FOUND") return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not restore the revision." }, { status: 500 });
  }
}
