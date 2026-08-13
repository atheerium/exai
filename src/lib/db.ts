import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const userContext = new AsyncLocalStorage<string>();

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function setRlsContext(userId: string) {
  await prisma.$executeRawUnsafe(
    `SET LOCAL app.current_user_id = '${userId.replace(/'/g, "''")}'`
  );
  userContext.enterWith(userId);
}
