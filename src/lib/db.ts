import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type DbClient = Prisma.TransactionClient | PrismaClient;

export interface WithRlsOptions {
  timeout?: number;
  maxWait?: number;
}

// Remote Supabase (pooled pgbouncer) queries routinely take several seconds
// from cold/dev networks; Prisma's default interactive-transaction timeout is
// only 5s, which expired mid-transaction and failed writes with
// "Transaction already closed". Keep defaults well above observed RTT.
const DEFAULT_TX_TIMEOUT_MS = 30_000;
const DEFAULT_TX_MAX_WAIT_MS = 10_000;

const TRANSIENT_MESSAGE_PARTS = [
  "can't reach database server",
  "connection reset",
  "connection terminated",
  "connection timed out",
  "timed out fetching a new connection",
  "socket hang up",
  "econnreset",
  "etimedout",
  "enotfound",
  "econnrefused",
];

export function isTransientDbError(e: unknown): boolean {
  const err = e as { name?: string; message?: string; code?: string };
  if (err?.name === "PrismaClientInitializationError") return true;
  if (err?.code === "P1001" || err?.code === "P1002" || err?.code === "P1017") return true;
  const msg = String(err?.message ?? e).toLowerCase();
  return TRANSIENT_MESSAGE_PARTS.some((p) => msg.includes(p));
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; delayMs?: number }
): Promise<T> {
  const retries = opts?.retries ?? 2;
  const delayMs = opts?.delayMs ?? 400;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransientDbError(e) || attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw last;
}

/**
 * Run `fn` inside an interactive transaction with the RLS identity set first.
 * `SET LOCAL` only has an effect inside a transaction block, so the previous
 * bare `SET LOCAL` outside a transaction was a no-op on pooled (pgbouncer)
 * connections. Every query issued through `tx` in `fn` sees
 * `app.current_user_id`. Callers must still keep `userId` where-clauses
 * (defense in depth) since RLS policies are a second layer, not the primary.
 *
 * Notes:
 * - `track()` (product analytics, fire-and-forget) intentionally stays on the
 *   global client: it is best-effort and unrelated to row isolation.
 * - `restoreRevision()` manages its own internal transaction and therefore
 *   cannot be nested inside `withRls`; its callers verify ownership inside a
 *   `withRls` check first and run the restore on the global client scoped by
 *   examId.
 */
export async function withRls<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: WithRlsOptions
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${userId.replace(/'/g, "''")}'`
      );
      return fn(tx);
    },
    {
      timeout: opts?.timeout ?? DEFAULT_TX_TIMEOUT_MS,
      maxWait: opts?.maxWait ?? DEFAULT_TX_MAX_WAIT_MS,
    }
  );
}
