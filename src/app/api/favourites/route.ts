import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRls } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { safeParse } from "@/lib/serialize";
import { track } from "@/lib/events";

const createSchema = z.object({
  label: z.string().min(1).max(120),
  prompt: z.string().min(1),
  instruction: z.string().optional(),
  answer: z.string().optional(),
  marks: z.number().optional(),
  skill: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const items = await withRls(user.id, async (tx) => {
      return tx.favouriteTask.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
    });
    return NextResponse.json({
      items: items.map((f) => ({ id: f.id, label: f.label, content: safeParse(f.content, {}) })),
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not load favourites." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req.headers);
    const user = await requireUser();
    const body = createSchema.parse(await req.json());
    const item = await withRls(user.id, async (tx) => {
      return tx.favouriteTask.create({
        data: {
          userId: user.id,
          label: body.label,
          content: JSON.stringify({
            prompt: body.prompt,
            instruction: body.instruction ?? null,
            answer: body.answer ?? null,
            marks: body.marks ?? 1,
            skill: body.skill ?? null,
          }),
        },
      });
    });
    await track("task_saved_favourite", { userId: user.id });
    return NextResponse.json({ id: item.id, label: item.label }, { status: 201 });
  } catch (e: any) {
    if (e?.message === "CSRF_MISMATCH") return NextResponse.json({ error: "CSRF failed." }, { status: 403 });
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not save favourite." }, { status: 500 });
  }
}
