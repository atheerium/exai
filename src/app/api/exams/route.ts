import { NextRequest, NextResponse } from "next/server";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { examToDto } from "@/lib/serialize";
import { track } from "@/lib/events";

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const exam = await withRls(user.id, async (tx) => {
      return tx.exam.create({
        data: { userId: user.id, title: body.title?.trim() || "Untitled exam", status: "NEW" },
      });
    });
    await track("exam_created", { userId: user.id, examId: exam.id });
    const dto = await examToDto({ ...exam, sections: [], sources: [] });
    return NextResponse.json(dto, { status: 201 });
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not create exam." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const exams = await withRls(user.id, async (tx) => {
      return tx.exam.findMany({
        where: { userId: user.id, status: { not: "ARCHIVED" } },
        include: {
          config: true,
          sections: { include: { tasks: true, topics: true } },
          sources: true,
        },
        orderBy: { lastOpenedAt: "desc" },
      });
    });
    const dtos = await Promise.all(exams.map((e) => examToDto(e)));
    return NextResponse.json({ exams: dtos });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not load exams." }, { status: 500 });
  }
}
