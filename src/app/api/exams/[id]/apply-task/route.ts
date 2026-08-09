import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { track } from "@/lib/events";

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
    const user = await requireUser();
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const body = schema.parse(await req.json());
    const task = await prisma.task.findFirst({ where: { id: body.taskId, section: { examId: id } } });
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        prompt: body.prompt,
        instruction: body.instruction ?? task.instruction,
        answer: body.answer ?? task.answer,
        marks: body.marks ?? task.marks,
        skill: body.skill ?? task.skill,
        manualEdited: true,
      },
    });
    await track(body.source === "favourite" ? "favourite_applied" : "custom_task_applied", {
      userId: user.id,
      examId: id,
    });

    const dto = await loadExamDto(id, user.id);
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not apply task." }, { status: 500 });
  }
}
