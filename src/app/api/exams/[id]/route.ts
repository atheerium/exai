import { NextRequest, NextResponse } from "next/server";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { validateConfigInputs } from "@/lib/guide";
import { getGrade, getGuide } from "@/data/guides";
import { track } from "@/lib/events";
import { captureRevision } from "@/lib/revisions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const dto = await withRls(user.id, async (tx) => {
      return loadExamDto(id, user.id, tx);
    });
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message === "NOT_FOUND") return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json({ error: "Could not load exam." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as any;

    const dto = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id } });
      if (!exam) return null;

      if (body.config) {
        validateConfigInputs(body.config);
        const gradeDef = getGrade(body.config.grade);
        const unit = gradeDef.units.find((u) => u.key === body.config.unit) ?? gradeDef.units[0];
        const guide = getGuide(body.config.grade, body.config.language === "fr" ? "fr" : "en", body.config.stream ?? undefined);
        const title =
          `English exam, ${gradeDef.label.toUpperCase()}, ${unit?.label ?? ""}`.trim().replace(/, $/, "") ||
          "Untitled exam";
        // Sequential (not array-form $transaction): interactive transactions
        // cannot be nested inside withRls. Order preserved: config first.
        await tx.examConfig.upsert({
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
            teacherKeywords: body.config.teacherKeywords ?? null,
            difficulty: body.config.difficulty ?? null,
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
            teacherKeywords: body.config.teacherKeywords ?? null,
            difficulty: body.config.difficulty ?? null,
          },
        });
        await tx.exam.update({ where: { id }, data: { title, status: "ACTIVE" } });
        await captureRevision(id, "Parameters set", tx);
      }

      if (body.title) {
        await tx.exam.update({ where: { id }, data: { title: String(body.title).slice(0, 120) } });
      }

      if (body.status) {
        const allowedStatus = ["NEW", "DRAFT", "ACTIVE", "EXPORTED", "ARCHIVED"];
        if (!allowedStatus.includes(body.status)) {
          throw new Error("VALIDATION:Invalid exam status.");
        }
        await tx.exam.update({ where: { id }, data: { status: String(body.status) } });
      }

      // Section content edits (autosave) — updates only the fields the client sent.
      if (Array.isArray(body.sections)) {
        for (const sec of body.sections) {
          if (!sec.id) continue;
          const section = await tx.examSection.findFirst({ where: { id: sec.id, examId: id } });
          if (!section) continue;
          if (typeof sec.text === "string" || typeof sec.textTitle === "string" || "sourceIndex" in sec) {
            const content = section.content ? JSON.parse(section.content) : {};
            if (typeof sec.text === "string") content.text = String(sec.text).slice(0, 30000);
            if (typeof sec.textTitle === "string") content.title = String(sec.textTitle).slice(0, 500);
            if ("sourceIndex" in sec) {
              content.sourceIndex = sec.sourceIndex === null ? null : Number(sec.sourceIndex);
            }
            if (sec.clearPrevious) {
              delete content.previousText;
              delete content.previousTitle;
            }
            await tx.examSection.update({ where: { id: section.id }, data: { content: JSON.stringify(content) } });
          }
          if (Array.isArray(sec.tasks)) {
            for (const t of sec.tasks) {
              const task = await tx.task.findFirst({ where: { id: t.id, sectionId: section.id } });
              if (!task) continue;
              const data: any = {};
              if (typeof t.prompt === "string") data.prompt = String(t.prompt).slice(0, 5000);
              if (typeof t.instruction === "string") data.instruction = String(t.instruction).slice(0, 5000);
              if (typeof t.answer === "string") data.answer = String(t.answer).slice(0, 5000);
              if (typeof t.marks === "number" && Number.isFinite(t.marks) && t.marks >= 0 && t.marks <= 100) data.marks = t.marks;
              if (Object.keys(data).length) {
                data.manualEdited = true;
                await tx.task.update({ where: { id: task.id }, data });
              }
            }
          }
          if (Array.isArray(sec.topics)) {
            for (const t of sec.topics) {
              const topic = await tx.topic.findFirst({ where: { id: t.id, sectionId: section.id } });
              if (!topic) continue;
              const data: any = {};
              if (typeof t.situation === "string") data.situation = String(t.situation).slice(0, 5000);
              if (typeof t.instruction === "string") data.instruction = String(t.instruction).slice(0, 5000);
              if (typeof t.keywords === "string") data.keywords = String(t.keywords).slice(0, 1000);
              if (typeof t.title === "string") data.title = String(t.title).slice(0, 500);
              if (typeof t.form === "string") data.form = t.form;
              if (typeof t.marks === "number" && Number.isFinite(t.marks) && t.marks >= 0 && t.marks <= 100) data.marks = t.marks;
              if (Object.keys(data).length) {
                data.manualEdited = true;
                await tx.topic.update({ where: { id: topic.id }, data });
              }
            }
          }
        }
      }

      if (body.status === "ARCHIVED") {
        // Archive keeps the row; library hides it.
      }

      return loadExamDto(id, user.id, tx);
    });

    if (!dto) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    if (body.config) {
      await track("parameters_completed", { userId: user.id, examId: id });
    }
    return NextResponse.json(dto);
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message === "VALIDATION:Invalid exam status.") return NextResponse.json({ error: "Invalid exam status." }, { status: 400 });
    if (e?.message?.includes("Length") || e?.message?.includes("Unit") || e?.message?.includes("No unit")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e?.message?.includes("Grade") || e?.message?.includes("Stream") || e?.message?.includes("Missing")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update exam." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const { id } = await params;
    const deleted = await withRls(user.id, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id, userId: user.id } });
      if (!exam) return false;
      await tx.exam.delete({ where: { id } });
      return true;
    });
    if (!deleted) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    return NextResponse.json({ error: "Could not delete exam." }, { status: 500 });
  }
}
