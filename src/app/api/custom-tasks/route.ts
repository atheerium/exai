import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, setRlsContext } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
    await setRlsContext(user.id);
    const items = await prisma.customTask.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      items: items.map((t) => ({ id: t.id, label: t.label, content: JSON.parse(t.content) })),
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not load custom tasks." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await setRlsContext(user.id);
    const body = createSchema.parse(await req.json());
    const item = await prisma.customTask.create({
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
    await track("custom_task_created", { userId: user.id });
    return NextResponse.json({ id: item.id, label: item.label }, { status: 201 });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Could not save custom task." }, { status: 500 });
  }
}
