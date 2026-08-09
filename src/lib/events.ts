import { prisma } from "@/lib/db";

// Lightweight product event tracking (PRD section 28.1). Fire-and-forget:
// tracking failures must never break the user-facing action.

export type EventName =
  | "signup_completed"
  | "exam_created"
  | "parameters_completed"
  | "text_generated"
  | "text_alternative_selected"
  | "part_one_generated"
  | "task_replaced"
  | "part_two_generated"
  | "writing_generated"
  | "topic_replaced"
  | "task_saved_favourite"
  | "custom_task_created"
  | "custom_task_applied"
  | "favourite_applied"
  | "exam_exported_pdf"
  | "exam_exported_docx"
  | "generation_failed";

export async function track(name: EventName, opts: { userId?: string; examId?: string; meta?: Record<string, unknown> } = {}) {
  try {
    await prisma.productEvent.create({
      data: {
        name,
        userId: opts.userId ?? null,
        examId: opts.examId ?? null,
        meta: opts.meta ? JSON.stringify(opts.meta) : null,
      },
    });
  } catch {
    // non-fatal
  }
}

export async function recentEvents(limit = 200) {
  return prisma.productEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
