// The single reader for feedback and family statistics.
//
// WHY THIS EXISTS SEPARATELY FROM `lib/feedback.ts`
// -------------------------------------------------
// `feedback.ts` is pure — no database, no network — so its tests can run offline
// with no import of Prisma. That is a deliberate constraint, and it is why the
// queries do not live there.
//
// Why not inline in each caller: this aggregation was originally written twice,
// in `/api/ops/feedback` and in the `/ops` page, and the two copies had already
// drifted (one ordered by `createdAt` and took 30, the other by `updatedAt` and
// took 20). That is the same "two surfaces cannot disagree" rule the export
// pipeline is built around, applied to a dashboard that is supposed to be a
// measurement instrument. If the numbers a teacher action produces and the
// numbers you read on /ops disagree, the whole feature is untrustworthy.

import { prisma } from "@/lib/db";
import { familyKeyFor } from "./feedback";

/** How many ratings the dashboard shows. Recent-first. */
const FEEDBACK_TAKE = 20;

export interface FeedbackOverview {
  exams: {
    examId: string;
    title: string;
    rating: string;
    comment: string | null;
    createdAt: Date;
  }[];
  families: { family: string; skill: string | null; rejected: number; applied: number }[];
}

export async function loadFeedbackOverview(): Promise<FeedbackOverview> {
  const [rows, families] = await Promise.all([
    prisma.examFeedback.findMany({
      // `createdAt`, not `updatedAt`: the feed is "what teachers said recently",
      // and re-rating an old exam should not drag it back to the top as if the
      // opinion were new.
      orderBy: { createdAt: "desc" },
      take: FEEDBACK_TAKE,
      select: {
        examId: true,
        rating: true,
        comment: true,
        createdAt: true,
        exam: { select: { title: true } },
      },
    }),
    prisma.taskFamilyStat.findMany({ orderBy: { rejected: "desc" } }),
  ]);

  return {
    exams: rows.map((r) => ({
      examId: r.examId,
      title: r.exam.title,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
    families: families.map((f) => ({ family: f.family, skill: f.skill, rejected: f.rejected, applied: f.applied })),
  };
}

/**
 * Increment one counter on a family, outside any tenant transaction.
 *
 * Analytics only. It runs on the global client with `.catch(() => {})` for the
 * same reason `track()` does: a teacher regenerating a task must never have that
 * generation fail because a counter did not move.
 */
export async function recordFamilyStat(
  task: { family?: string | null; skill?: string | null } | null | undefined,
  field: "rejected" | "applied"
): Promise<void> {
  const { family, skill } = familyKeyFor(task ?? {});
  await prisma.taskFamilyStat
    .upsert({
      where: { family },
      create: { family, skill, [field]: 1 },
      update: { [field]: { increment: 1 }, skill: skill ?? undefined },
    })
    .catch(() => {});
}