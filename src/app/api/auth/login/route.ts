import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { loginThrottle, ipLoginThrottle, clientIp } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();
    const ip = clientIp(req.headers);
    const emailKey = `${ip}|${email}`;
    const ipKey = `${ip}`;

    const emailGate = loginThrottle.check(emailKey);
    const ipGate = ipLoginThrottle.check(ipKey);
    if (!emailGate.allowed || !ipGate.allowed) {
      const retryAfterMs = Math.max(emailGate.retryAfterMs, ipGate.retryAfterMs);
      return NextResponse.json(
        { error: "Too many failed attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      loginThrottle.recordFailure(emailKey);
      ipLoginThrottle.recordFailure(ipKey);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      loginThrottle.recordFailure(emailKey);
      ipLoginThrottle.recordFailure(ipKey);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    loginThrottle.clear(emailKey);
    ipLoginThrottle.clear(ipKey);
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    if (e?.issues) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
