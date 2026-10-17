import { NextRequest, NextResponse } from "next/server";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { loadExamDto, touchLastOpened } from "@/lib/serialize";
import { track } from "@/lib/events";
import { captureRevision } from "@/lib/revisions";
import { familyKeyFor } from "@/lib/feedback";
import { recordFamilyStat } from "@/lib/feedback-data";
import { getGuide } from "@/data/guides";
import type { EventName } from "@/lib/events";

// Select a candidate for one item (text, task or topic). Only that item is
// replaced; the previous value stays recoverable (PRD sections 9.2, 15.3).

function clampMarks(marks: number): number {
  return Math.max(0, Math.min(100, marks));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;

    const body = (await req.json()) as {
      kind: "TEXT" | "TASK" | "TOPIC";
      taskId?: string;
      topicId?: string;
      index: number;
    };

    const result = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id }, include: { config: true } });
      if (!exam) return null;

      let event: EventName | null = null;
      let appliedFamily: { family: string; skill: string | null } | null = null;
      let revisionLabel: string | null = null;

      if (body.kind === "TEXT") {
        const section = await tx.examSection.findFirst({ where: { examId: id, type: "TEXT" } });
        if (!section) throw new Error("VALIDATION:No text has been generated.");
        const content = section.content ? JSON.parse(section.content) : {};
        const candidates = content.candidates ?? [];
        if (!candidates[body.index]) throw new Error("NOT_FOUND_CANDIDATE");
        const previous = { title: content.title ?? "", text: content.text ?? "" };
        content.title = candidates[body.index].title;
        content.text = candidates[body.index].text;
        if (previous.text && previous.text !== content.text) {
          candidates.push(previous);
        }
        content.candidates = candidates;
        await tx.examSection.update({ where: { id: section.id }, data: { content: JSON.stringify(content) } });
        await tx.generation.create({ data: { examId: id, type: "TEXT", provider: "select", status: "OK" } });
        event = "text_alternative_selected";
        revisionLabel = "Text alternative selected";
      } else if (body.kind === "TASK" && body.taskId) {
        const task = await tx.task.findFirst({ where: { id: body.taskId, section: { examId: id } }, include: { section: true } });
        if (!task) throw new Error("NOT_FOUND_TASK");
        const candidates = task.candidates ? JSON.parse(task.candidates) : [];
        const picked = candidates[body.index];
        if (!picked) throw new Error("NOT_FOUND_CANDIDATE");
        await tx.task.update({
          where: { id: task.id },
          data: {
            prompt: picked.prompt,
            instruction: picked.instruction ?? task.instruction,
            answer: picked.answer ?? task.answer,
            marks: clampMarks(picked.marks ?? task.marks),
            skill: picked.skill ?? task.skill,
          },
        });

        const guide = getGuide(exam.config!.grade, exam.config!.language ?? "en", exam.config!.stream ?? undefined);
        const expectedMarks =
          task.section.type === "PART_ONE" ? guide.marks.partOne : guide.marks.textExploration;
        const allTasks = await tx.task.findMany({ where: { sectionId: task.section.id } });
        const total = allTasks.reduce((s, t) => s + t.marks, 0);
        if (Math.abs(total - expectedMarks) > 0.05) {
          await tx.generation.create({ data: { examId: id, type: "TASK_ALT", provider: "select", status: "ERROR", error: `Section marks total ${total} instead of the required ${expectedMarks}.` } });
          return { tag: "INVALID_TOTALS", issues: [`Section marks total ${total} instead of the required ${expectedMarks}.`] } as const;
        }

        await tx.generation.create({ data: { examId: id, type: "TASK_ALT", provider: "select", status: "OK" } });
        event = "task_replaced";
        revisionLabel = "Task replaced";
        // The teacher KEPT an alternative, which is the opposite signal to a
        // rejection: this family is recoverable. Recorded outside the tenant
        // transaction below, so analytics can never fail a replacement.
        appliedFamily = familyKeyFor(task);
      } else if (body.kind === "TOPIC" && body.topicId) {
        const topic = await tx.topic.findFirst({ where: { id: body.topicId, section: { examId: id } } });
        if (!topic) throw new Error("NOT_FOUND_TOPIC");
        const candidates = topic.candidates ? JSON.parse(topic.candidates) : [];
        const picked = candidates[body.index];
        if (!picked) throw new Error("NOT_FOUND_CANDIDATE");
        await tx.topic.update({
          where: { id: topic.id },
          data: {
            situation: picked.situation ?? topic.situation,
            instruction: picked.instruction ?? topic.instruction,
            keywords: picked.keywords ?? topic.keywords,
            form: picked.form ?? topic.form,
            title: picked.title ?? topic.title,
          },
        });
        await tx.generation.create({ data: { examId: id, type: "TOPIC_ALT", provider: "select", status: "OK" } });
        event = "topic_replaced";
        revisionLabel = "Topic replaced";
      } else {
        throw new Error("VALIDATION:Invalid replacement request.");
      }

      if (revisionLabel) await captureRevision(id, revisionLabel, tx);
      await touchLastOpened(id, user.id, tx);
      const dto = await loadExamDto(id, user.id, tx);
      return { tag: "OK", dto, event, appliedFamily } as const;
    });

    if (!result) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    if (result.tag === "OK") {
      if (result.event) await track(result.event, { userId: user.id, examId: id });
      if (result.appliedFamily) await recordFamilyStat(result.appliedFamily, "applied");
      return NextResponse.json(result.dto);
    }
    return NextResponse.json({ error: result.issues.join(" ") }, { status: 422 });
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message === "VALIDATION:No text has been generated.") return NextResponse.json({ error: "No text has been generated." }, { status: 400 });
    if (e?.message === "VALIDATION:Invalid replacement request.") return NextResponse.json({ error: "Invalid replacement request." }, { status: 400 });
    if (e?.message === "NOT_FOUND_CANDIDATE") return NextResponse.json({ error: "Alternative not found." }, { status: 404 });
    if (e?.message === "NOT_FOUND_TASK") return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (e?.message === "NOT_FOUND_TOPIC") return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    return NextResponse.json({ error: "Could not apply replacement." }, { status: 500 });
  }
}
