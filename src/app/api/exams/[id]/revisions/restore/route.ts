import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { captureRevision, restoreRevision } from "@/lib/revisions";
import { track } from "@/lib/events";

const schema = z.object({ revisionId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;
    const body = schema.parse(await req.json());
    const exists = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id } });
      return !!exam;
    });
    if (!exists) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    // Snapshot current work before the destructive restore so it stays
    // available as a newer revision (matches versions-modal.tsx promise).
    // Both functions run on the global client scoped by examId: ownership
    // was verified above under RLS, and restoreRevision manages its own
    // internal transaction (cannot nest inside withRls).
    await captureRevision(id, "Before restore");
    await restoreRevision(id, body.revisionId);
    await track("exam_revision_restored", { userId: user.id, examId: id });

    const dto = await loadExamDto(id, user.id);
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message === "NOT_FOUND") return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not restore the revision." }, { status: 500 });
  }
}
