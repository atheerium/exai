import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { validateConfigInputs } from "@/lib/guide";
import { getGrade, getGuide } from "@/data/guides";
import { track } from "@/lib/events";
import { captureRevision } from "@/lib/revisions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const dto = await loadExamDto(id, user.id);
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message === "NOT_FOUND") return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json({ error: "Could not load exam." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const body = (await req.json()) as any;

    if (body.config) {
      validateConfigInputs(body.config);
      const gradeDef = getGrade(body.config.grade);
      const unit = gradeDef.units.find((u) => u.key === body.config.unit) ?? gradeDef.units[0];
      const guide = getGuide(body.config.grade);
      const title =
        `English exam — ${gradeDef.label.toUpperCase()} — ${unit?.label ?? ""}`.trim() ||
        "Untitled exam";
      await prisma.$transaction([
        prisma.examConfig.upsert({
          where: { examId: id },
          update: {
            level: body.config.level,
            grade: body.config.grade,
            stream: body.config.stream ?? null,
            length: body.config.length,
            unit: body.config.unit,
            topic: body.config.topic,
            customTopic: !!body.config.customTopic,
            guideVersion: guide.version,
            language: body.config.language === "fr" ? "fr" : "en",
          },
          create: {
            examId: id,
            level: body.config.level,
            grade: body.config.grade,
            stream: body.config.stream ?? null,
            length: body.config.length,
            unit: body.config.unit,
            topic: body.config.topic,
            customTopic: !!body.config.customTopic,
            guideVersion: guide.version,
            language: body.config.language === "fr" ? "fr" : "en",
          },
        }),
        prisma.exam.update({ where: { id }, data: { title, status: "ACTIVE" } }),
      ]);
      await track("parameters_completed", { userId: user.id, examId: id });
      await captureRevision(id, "Parameters set");
    }

    if (body.title) {
      await prisma.exam.update({ where: { id }, data: { title: String(body.title).slice(0, 120) } });
    }

    if (body.status) {
      await prisma.exam.update({ where: { id }, data: { status: String(body.status) } });
    }

    // Section content edits (autosave) — updates only the fields the client sent.
    if (Array.isArray(body.sections)) {
      for (const sec of body.sections) {
        if (!sec.id) continue;
        const section = await prisma.examSection.findFirst({ where: { id: sec.id, examId: id } });
        if (!section) continue;
        if (typeof sec.text === "string" || typeof sec.textTitle === "string") {
          const content = section.content ? JSON.parse(section.content) : {};
          if (typeof sec.text === "string") content.text = sec.text;
          if (typeof sec.textTitle === "string") content.title = sec.textTitle;
          await prisma.examSection.update({ where: { id: section.id }, data: { content: JSON.stringify(content) } });
        }
        if (Array.isArray(sec.tasks)) {
          for (const t of sec.tasks) {
            const task = await prisma.task.findFirst({ where: { id: t.id, sectionId: section.id } });
            if (!task) continue;
            const data: any = {};
            if (typeof t.prompt === "string") data.prompt = t.prompt;
            if (typeof t.instruction === "string") data.instruction = t.instruction;
            if (typeof t.answer === "string") data.answer = t.answer;
            if (typeof t.marks === "number") data.marks = t.marks;
            if (Object.keys(data).length) {
              data.manualEdited = true;
              await prisma.task.update({ where: { id: task.id }, data });
            }
          }
        }
        if (Array.isArray(sec.topics)) {
          for (const t of sec.topics) {
            const topic = await prisma.topic.findFirst({ where: { id: t.id, sectionId: section.id } });
            if (!topic) continue;
            const data: any = {};
            if (typeof t.situation === "string") data.situation = t.situation;
            if (typeof t.instruction === "string") data.instruction = t.instruction;
            if (typeof t.keywords === "string") data.keywords = t.keywords;
            if (typeof t.title === "string") data.title = t.title;
            if (typeof t.form === "string") data.form = t.form;
            if (Object.keys(data).length) {
              data.manualEdited = true;
              await prisma.topic.update({ where: { id: topic.id }, data });
            }
          }
        }
      }
    }

    if (body.status === "ARCHIVED") {
      // Archive keeps the row; library hides it.
    }

    const dto = await loadExamDto(id, user.id);
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message?.includes("Length")) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e?.message?.includes("Grade") || e?.message?.includes("Stream") || e?.message?.includes("Missing")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update exam." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, userId: user.id } });
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    await prisma.exam.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Could not delete exam." }, { status: 500 });
  }
}
