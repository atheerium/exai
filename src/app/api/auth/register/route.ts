import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { track } from "@/lib/events";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().max(80).optional(),
  language: z.enum(["en", "fr"]).optional().default("en"),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: body.name?.trim() || null, language: body.language },
    });
    await createSession(user.id);
    await track("signup_completed", { userId: user.id });
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
