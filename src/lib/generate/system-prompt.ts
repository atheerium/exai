// The system prompt, in its own file.
//
// WHY THIS IS SEPARATE
// --------------------
// This four-line string is the most load-bearing text in the application. Every
// single generation — passage, comprehension, the five Part B tasks, writing
// topics, rewrites, alternatives — sends it. It also changes more often than any
// other line in the codebase, and while it lived as a constant at the top of
// `provider.ts` (1000+ lines of transport, request building and parsing) every
// edit to it meant scrolling past all of that and every diff of it was buried in
// an unrelated file's changes.
//
// The request strings (the `request:` field per generator, in `provider.ts`) are
// deliberately NOT here. Each is coupled to the parsing, stamping and validation
// directly beneath it, and moving them apart would create a second source of
// truth for shapes that the validators already mirror. `provider.ts` remains the
// index for those; AGENTS.md lists them.
//
// WHAT IS AND IS NOT THIS PROMPT'S JOB
// -------------------------------------
// It states the three things that are true of EVERY call: who the assistant is,
// that the reply is JSON matching the requested schema, and that the official
// structure is binding. It deliberately says nothing about any specific task.
//
// Structure is NOT negotiated here. Marks, item counts, table shapes, answer
// cells and word banks are computed in code and stamped after parsing — see
// "The three official Part B table structures" and "Word banks are EXTRACTED" in
// AGENTS.md. A prompt instruction is a REQUEST, never the guarantee: the model
// has been measured ignoring a prose rule roughly half the time.
//
// So when something prints wrong, ask first which side of that line failed. If a
// validator rejected it, the answer is in the guide or the stamp, not here.

export const SYSTEM_PROMPT = [
  "You are Exaai, an assistant that helps Algerian English teachers create structured English exams.",
  "You always reply with valid JSON only, matching the exact schema requested by the user. Never include extra text, markdown, or explanation.",
  "Follow the official exam structure for the given grade exactly. Respect word counts, mark allocations, and skill categories.",
  "Do not invent marks that conflict with the requested totals.",
].join(" ");