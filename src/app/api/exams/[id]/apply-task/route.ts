import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { loadExamDto, touchLastOpened } from "@/lib/serialize";
import { track } from "@/lib/events";
import { getGuide } from "@/data/guides";

const schema = z.object({
  taskId: z.string().min(1),
  prompt: z.string().min(1),
  instruction: z.string().optional(),
  answer: z.string().optional(),
  marks: z.number().optional(),
  skill: z.string().optional(),
  source: z.enum(["favourite", "custom"]).optional().default("favourite"),
});

// Apply a saved favourite or custom task to one task in the exam (PRD 9.2).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;
    const body = schema.parse(await req.json());
    const result = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id }, include: { config: true } });
      if (!exam) return "EXAM_NOT_FOUND" as const;
      const task = await tx.task.findFirst({
        where: { id: body.taskId, section: { examId: id } },
        include: { section: true },
      });
      if (!task) return "TASK_NOT_FOUND" as const;
      const clampedMarks = body.marks !== undefined ? Math.max(0, Math.min(100, body.marks)) : task.marks;
      await tx.task.update({
        where: { id: task.id },
        data: {
          prompt: body.prompt,
          instruction: body.instruction ?? task.instruction,
          answer: body.answer ?? task.answer,
          marks: clampedMarks,
          skill: body.skill ?? task.skill,
          manualEdited: true,
        },
      });
      const guide = getGuide(exam.config!.grade, exam.config!.language ?? "en", exam.config!.stream ?? undefined);
      const expectedMarks =
        task.section.type === "PART_ONE" ? guide.marks.partOne : guide.marks.textExploration;
      const allTasks = await tx.task.findMany({ where: { sectionId: task.section.id } });
      const total = allTasks.reduce((s, t) => s + t.marks, 0);
      if (Math.abs(total - expectedMarks) > 0.05) {
        return { issues: [`Section marks total ${total} instead of the required ${expectedMarks}.`] } as const;
      }
      await touchLastOpened(id, user.id, tx);
      return "OK" as const;
    });
    if (result === "EXAM_NOT_FOUND") return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    if (result === "TASK_NOT_FOUND") return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (typeof result === "object" && "issues" in result) {
      return NextResponse.json({ error: result.issues.join(" ") }, { status: 422 });
    }

    await track(body.source === "favourite" ? "favourite_applied" : "custom_task_applied", {
      userId: user.id,
      examId: id,
    });

    const dto = await loadExamDto(id, user.id);
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not apply task." }, { status: 500 });
  }
}
