// How many proposals a generation call should return.
//
// Its own module so the mock provider can read it without importing
// `provider.ts` (which imports `index.ts`, which imports the mock) — a cycle.
// Both providers must agree on this: a test double that returns a different
// SHAPE from the code it stands in for silently stops covering that code.

/** One by default: the teacher asked for an exam, not for three of them. */
export const DEFAULT_CANDIDATES = 1;

/**
 * Proposals per generation call.
 *
 * ONE by default (user decision, 2026-10-12): generating three of everything
 * meant four calls returned ~3x the content while the teacher saw one — on a
 * free tier already capped near 8000 tokens per minute, that tripled the cost
 * of the run the teacher actually wanted.
 *
 * Alternatives remain available on demand: the replacement panel and the
 * rewrite path ask for them explicitly. `AI_CANDIDATES=3` restores the previous
 * behaviour globally for a deployment that wants a choice up front.
 *
 * Read per call rather than cached at module load, matching `chain.ts`: a
 * runtime env change must take effect without a restart.
 */
export function candidateCount(): number {
  const raw = Number(process.env.AI_CANDIDATES);
  return Number.isInteger(raw) && raw >= 1 && raw <= 3 ? raw : DEFAULT_CANDIDATES;
}