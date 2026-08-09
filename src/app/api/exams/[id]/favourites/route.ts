import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { track } from "@/lib/events";

const schema = z.object({ taskId: z.string().min(1) });

// Save one exam task as a reusable favourite (PRD 9.2, US-020).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const body = schema.parse(await req.json());
    const task = await prisma.task.findFirst({ where: { id: body.taskId, section: { examId: id } } });
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

    const label = task.prompt.split("\n")[0].replace(/^[\d\W]+/, "").slice(0, 80) || "Saved task";
    const item = await prisma.favouriteTask.create({
      data: {
        userId: user.id,
        label,
        content: JSON.stringify({
          prompt: task.prompt,
          instruction: task.instruction,
          answer: task.answer,
          marks: task.marks,
          skill: task.skill,
        }),
      },
    });
    await track("task_saved_favourite", { userId: user.id, examId: id });
    return NextResponse.json({ id: item.id, label: item.label }, { status: 201 });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not save favourite." }, { status: 500 });
  }
}
