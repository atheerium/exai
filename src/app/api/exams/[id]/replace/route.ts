import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { track } from "@/lib/events";

// Select a candidate for one item (text, task or topic). Only that item is
// replaced; the previous value stays recoverable (PRD sections 9.2, 15.3).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const body = (await req.json()) as {
      kind: "TEXT" | "TASK" | "TOPIC";
      taskId?: string;
      topicId?: string;
      index: number;
    };

    if (body.kind === "TEXT") {
      const section = await prisma.examSection.findFirst({ where: { examId: id, type: "TEXT" } });
      if (!section) return NextResponse.json({ error: "No text has been generated." }, { status: 400 });
      const content = section.content ? JSON.parse(section.content) : {};
      const candidates = content.candidates ?? [];
      if (!candidates[body.index]) return NextResponse.json({ error: "Alternative not found." }, { status: 404 });
      // Capture the current text BEFORE replacing so it stays recoverable (PRD 15.3).
      const previous = { title: content.title ?? "", text: content.text ?? "" };
      content.title = candidates[body.index].title;
      content.text = candidates[body.index].text;
      if (previous.text && previous.text !== content.text) {
        candidates.push(previous);
      }
      content.candidates = candidates;
      await prisma.examSection.update({ where: { id: section.id }, data: { content: JSON.stringify(content) } });
      await prisma.generation.create({ data: { examId: id, type: "TEXT", provider: "select", status: "OK" } });
      await track("text_alternative_selected", { userId: user.id, examId: id });
    } else if (body.kind === "TASK" && body.taskId) {
      const task = await prisma.task.findFirst({ where: { id: body.taskId, section: { examId: id } } });
      if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
      const candidates = task.candidates ? JSON.parse(task.candidates) : [];
      const picked = candidates[body.index];
      if (!picked) return NextResponse.json({ error: "Alternative not found." }, { status: 404 });
      await prisma.task.update({
        where: { id: task.id },
        data: {
          prompt: picked.prompt,
          instruction: picked.instruction ?? task.instruction,
          answer: picked.answer ?? task.answer,
          marks: picked.marks ?? task.marks,
          skill: picked.skill ?? task.skill,
        },
      });
      await prisma.generation.create({ data: { examId: id, type: "TASK_ALT", provider: "select", status: "OK" } });
      await track("task_replaced", { userId: user.id, examId: id });
    } else if (body.kind === "TOPIC" && body.topicId) {
      const topic = await prisma.topic.findFirst({ where: { id: body.topicId, section: { examId: id } } });
      if (!topic) return NextResponse.json({ error: "Topic not found." }, { status: 404 });
      const candidates = topic.candidates ? JSON.parse(topic.candidates) : [];
      const picked = candidates[body.index];
      if (!picked) return NextResponse.json({ error: "Alternative not found." }, { status: 404 });
      await prisma.topic.update({
        where: { id: topic.id },
        data: {
          situation: picked.situation ?? topic.situation,
          instruction: picked.instruction ?? topic.instruction,
          keywords: picked.keywords ?? topic.keywords,
          form: picked.form ?? topic.form,
          title: picked.title ?? topic.title,
        },
      });
      await prisma.generation.create({ data: { examId: id, type: "TOPIC_ALT", provider: "select", status: "OK" } });
      await track("topic_replaced", { userId: user.id, examId: id });
    } else {
      return NextResponse.json({ error: "Invalid replacement request." }, { status: 400 });
    }

    const dto = await loadExamDto(id, user.id);
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not apply replacement." }, { status: 500 });
  }
}
