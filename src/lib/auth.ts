import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "exai_session";
const CSRF_COOKIE = "csrf_token";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export async function createSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const csrfToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  // Rotate: delete existing sessions for this user.
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.session.create({ data: { token: tokenHash, userId, expiresAt } });

  const store = await cookies();
  store.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  store.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getCurrentUser(): Promise<{ id: string; email: string; name: string | null; language: string; role: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { token: tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function requireUser(): Promise<{ id: string; email: string; name: string | null; language: string; role: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export function isAdmin(user: { email: string; role: string }): boolean {
  if (user.role === "admin") return true;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(user.email.toLowerCase());
}

export async function requireAdmin(): Promise<{ id: string; email: string; name: string | null; language: string; role: string }> {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("FORBIDDEN");
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.session.deleteMany({ where: { token: tokenHash } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

export async function requireCsrf(reqHeaders: Headers): Promise<void> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  const headerToken = reqHeaders.get("X-CSRF-Token");
  if (!cookieToken || cookieToken !== headerToken) {
    throw new Error("CSRF_MISMATCH");
  }
}

export async function getCsrfCookie(): Promise<string | undefined> {
  return (await cookies()).get(CSRF_COOKIE)?.value;
}
