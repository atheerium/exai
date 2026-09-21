import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function setRlsContext(userId: string) {
  // Note: on pooled (pgbouncer) connections SET LOCAL may not persist
  // across queries. This is best-effort; actual isolation relies on
  // app-level where clauses (e.g. userId checks) in every query.
  await prisma.$executeRawUnsafe(
    `SET LOCAL app.current_user_id = '${userId.replace(/'/g, "''")}'`
  );
}
