import { NextRequest, NextResponse } from "next/server";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { track } from "@/lib/events";
import { parseFeedback } from "@/lib/feedback";

// Teacher feedback on one exam draft.
//
// This is a signal to US about which task families produce output teachers
// reject. It is deliberately write-only as far as generation is concerned:
// nothing in `src/lib/generate/` reads this row, and no prompt may be derived
// from a rating.
//
// One row per (exam, user): re-submitting upserts, so changing a mind does not
// leave a trail of contradictory ratings on the same draft.

/** Upsert the caller's rating. Returns null when the exam is not theirs. */
async function saveFeedback(examId: string, userId: string, rating: string, comment: string | null) {
  return withRls(userId, async (tx) => {
    // Ownership is the where-clause, not RLS: `prisma/rls.sql` only ENABLEs
    // policies and is bypassed by the pooler role, so this check is the tenant
    // isolation and must never be dropped.
    const exam = await tx.exam.findFirst({ where: { id: examId, userId }, select: { id: true } });
    if (!exam) return null;
    await tx.examFeedback.upsert({
      where: { examId_userId: { examId, userId } },
      create: { examId, userId, rating, comment },
      update: { rating, comment },
    });
    return true;
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;
    const body = parseFeedback(await req.json());
    const saved = await saveFeedback(id, user.id, body.rating, body.comment);
    if (!saved) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    // Fire-and-forget: the rating is already stored, a dropped event must not
    // fail the teacher's save.
    await track("exam_feedback", { userId: user.id, examId: id, meta: { rating: body.rating } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
}

// Read back the CURRENT user's own rating so the control reflects stored state
// instead of guessing. Scoped by `userId` deliberately: a teacher's colleagues'
// ratings are not theirs to read, and an unscoped read here would be a
// cross-tenant leak.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const found = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id }, select: { id: true } });
      if (!exam) return undefined;
      return (
        (await tx.examFeedback.findFirst({
          where: { examId: id, userId: user.id },
          select: { rating: true, comment: true, updatedAt: true },
        })) ?? null
      );
    });
    if (found === undefined) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    // The body IS the feedback, or null when there is none.
    return NextResponse.json(
      found === null ? null : { rating: found.rating, comment: found.comment, updatedAt: found.updatedAt }
    );
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not load feedback." }, { status: 500 });
  }
}