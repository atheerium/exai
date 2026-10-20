// Provider fallback chain.
//
// One env string names an ordered list of provider entries, e.g.
//   AI_PROVIDER_CHAIN="nvidia:nvidia/nemotron-3.5-lightning-30b-a3b,openrouter:google/gemma-4-31b-it:free"
//
// Why this exists: free-tier endpoints are shared-capacity and 429 or return
// "provider returned error" at random (measured 2026-10-11: the same OpenRouter
// model succeeded and failed across identical requests minutes apart). One
// flaky endpoint is not a reason to lose a teacher's whole exam.
//
// Advance policy, deliberately asymmetric:
//   - 429 / 5xx / timeout / unusable reply -> try the next entry
//   - 401 / 403 -> STOP. That is a credential or endpoint problem; cycling
//     through the rest of the chain only turns one clear error into a confusing
//     one, and burns the fallback quota while failing anyway.
//   - validation failure (the model answered, the answer was wrong) -> STOP.
//     A different model will not know more about this exam's guide rules.
//
// The chain is parsed and resolved without network access so it can be unit
// tested; `AGENTS.md` records that no test may touch the network.

import type { ProviderConfig } from "./provider";

export interface ChainEntry {
  /** Which env var holds the key, and which transport defaults to use. */
  provider: "groq" | "openai" | "openrouter" | "nvidia";
  model: string;
}

/**
 * The env surface this module actually needs: a read-only map of strings.
 *
 * Not `NodeJS.ProcessEnv` — the Next type augmentation marks `NODE_ENV` as
 * required, so every test fixture would need a cast. `process.env` is assignable
 * to this, and it says exactly what is read.
 */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export interface ResolvedChainEntry extends ProviderConfig {
  /** Parsed entry, kept for error messages. */
  entry: ChainEntry;
}

/**
 * Error classes the advance policy keys off.
 *
 * `budget` is the run deadline being spent (see `GenContext.runDeadlineMs`).
 * It is terminal by construction — `assertDeadline` throws it before dialling,
 * outside the retry loop — but it is classified so callers can tell "the free
 * tier gave up" apart from "the provider is broken", and it must never advance:
 * the next entry would be refused by the same check.
 */
export type ChainFailure =
  | "auth"
  | "unavailable"
  | "throttle"
  | "server"
  | "content"
  | "validation"
  | "budget";

export class ChainError extends Error {
  readonly failure: ChainFailure;
  readonly provider: string;
  readonly model: string;
  constructor(failure: ChainFailure, provider: string, model: string, message: string) {
    super(message);
    this.name = "ChainError";
    this.failure = failure;
    this.provider = provider;
    this.model = model;
  }
}

/**
 * A 403 or 404 that is about THIS MODEL, not about the credential.
 *
 * Measured live 2026-10-11: `openai/gpt-oss-20b` returns
 * `403 The model ... is blocked at the project level`, while the key itself is
 * fine and the next entry works. Treating that as an auth failure aborts the
 * whole chain on an entry that simply is not available — which is the precise
 * situation a fallback chain exists to survive.
 *
 * A genuine credential problem reads differently ("invalid api key",
 * "unauthorized") and still stops the chain.
 */
const MODEL_UNAVAILABLE =
  /blocked at the project level|model is blocked|model not found|no such model|deprecated model|only available on age|is unavailable for free|model_not_found|only available on agentic harnesses|not found for account/;

/** Classify a thrown error so the caller can decide whether to advance. */
export function classifyFailure(e: unknown): ChainFailure {
  const msg = String((e as { message?: string })?.message ?? e);
  const lower = msg.toLowerCase();

  // Checked BEFORE the generic 401/403 rule: a per-model block arrives as a 403
  // but must not be mistaken for a bad key.
  if (MODEL_UNAVAILABLE.test(lower)) return "unavailable";
  if (/\b(401|403)\b/.test(lower) || /unauthorized|forbidden|invalid api key/.test(lower)) return "auth";
  if (/abort|timed? ?out|etimedout|econnreset|network|fetch failed|socket hang up|enotfound|econnrefused/.test(lower))
    return "throttle";
  if (/\b(429|500|502|503|504)\b/.test(lower) || /rate limit|overloaded|temporarily unavailable/.test(lower))
    return "throttle";
  if (/invalid json|no content|missing /.test(lower)) return "content";
  return "server";
}

/**
 * True when advancing to another entry could plausibly help.
 *
 * `auth` and `validation` are the two that stop the chain. `unavailable` is a
 * per-ENTRY problem (this model is blocked, retired or not free) and is the
 * clearest case of advancing: a different model is the entire point.
 */
export function shouldAdvance(failure: ChainFailure): boolean {
  return (
    failure === "throttle" ||
    failure === "server" ||
    failure === "content" ||
    failure === "unavailable"
  );
}

const DEFAULTS: Record<ChainEntry["provider"], { baseUrl: string; keyVar: string; label: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY", label: "groq" },
  openai: { baseUrl: "https://api.openai.com/v1", keyVar: "OPENAI_API_KEY", label: "openai" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY", label: "openrouter" },
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", keyVar: "NVIDIA_API_KEY", label: "nvidia" },
};

/**
 * The legacy single-provider model, used only when `AI_PROVIDER` is set or when
 * a key exists for a provider that is not in `DEFAULT_CHAIN` (e.g. a
 * Groq-only deployment). Keeping that path alive is what makes a single key
 * sufficient without forcing every operator onto the default roster.
 */
const SINGLE_PROVIDER_MODEL: Record<ChainEntry["provider"], { envVar: string; model: string }> = {
  groq: { envVar: "GROQ_MODEL", model: "openai/gpt-oss-120b" },
  openai: { envVar: "OPENAI_MODEL", model: "gpt-4o-mini" },
  openrouter: { envVar: "OPENROUTER_MODEL", model: "openai/gpt-oss-120b" },
  nvidia: { envVar: "NVIDIA_MODEL", model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
};

/**
 * Models that need `reasoning_effort` capped to return content at all.
 *
 * gpt-oss is a reasoning model: measured on Groq 2026-10-11 with
 * `response_format: json_object`, 0/6 requests produced content without the cap
 * (all failed JSON validation because reasoning consumed the whole budget) and
 * 6/6 produced valid JSON with `low`. Nemotron models on NVIDIA tolerate large
 * max_tokens without the cap. Kept explicit so a future default change cannot
 * silently reintroduce empty responses.
 */
const NEEDS_REASONING_CAP = /gpt-oss/i;

/**
 * Models that must be told to skip their reasoning trace.
 *
 * Nemotron 3.5 Lightning (and Ultra) spend the whole `max_tokens` budget thinking
 * when it is left on: measured live 2026-10-20, a JSON request returned
 * `finish_reason: "length"` with 4000 reasoning tokens and no content. NVIDIA
 * exposes the switch as `chat_template_kwargs.enable_thinking: false`.
 */
const NEEDS_THINKING_DISABLED = /nemotron-3(?:\.5)?/i;

/** The same models reached through OpenRouter use its `reasoning` switch. */
const OPENROUTER_REASONING_MODEL = /nemotron-3/i;

/** Parse `provider:model` pairs. Malformed entries are dropped, not fatal. */
export function parseChain(raw: string | undefined | null): ChainEntry[] {
  if (!raw || !raw.trim()) return [];
  const out: ChainEntry[] = [];
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const idx = entry.indexOf(":");
    if (idx <= 0) continue;
    const provider = entry.slice(0, idx).trim().toLowerCase();
    const model = entry.slice(idx + 1).trim();
    if (!model) continue;
    if (!(provider in DEFAULTS)) continue;
    out.push({ provider: provider as ChainEntry["provider"], model });
  }
  return out;
}

/**
 * Resolve entries to configs. Entries whose key is missing are skipped with a
 * note rather than throwing: a partially-configured environment should still
 * work through whichever providers it does have.
 */
export function resolveChain(
  entries: ChainEntry[],
  env: EnvLike = process.env
): { configs: ResolvedChainEntry[]; skipped: { entry: ChainEntry; reason: string }[] } {
  const configs: ResolvedChainEntry[] = [];
  const skipped: { entry: ChainEntry; reason: string }[] = [];

  for (const entry of entries) {
    const d = DEFAULTS[entry.provider];
    const apiKey = env[d.keyVar];
    if (!apiKey) {
      skipped.push({ entry, reason: `${d.keyVar} is not set` });
      continue;
    }
    // Per-provider base URL overrides let a self-hosted or proxied endpoint take
    // the place of the default without a code change.
    const baseUrl = (
      env[`${entry.provider.toUpperCase()}_BASE_URL`] || d.baseUrl
    ).replace(/\/$/, "");
    configs.push({
      entry,
      apiKey,
      baseUrl,
      model: entry.model,
      providerLabel: d.label,
      ...(NEEDS_REASONING_CAP.test(entry.model) ? { reasoningEffort: "low" as const } : {}),
      // A reasoning trace is charged against `max_tokens`, and these models
      // otherwise return an empty answer. The field is provider-specific, so it
      // is only sent to the endpoint that documents it.
      ...(entry.provider === "nvidia" && NEEDS_THINKING_DISABLED.test(entry.model)
        ? { chatTemplateKwargs: { enable_thinking: false } }
        : {}),
      ...(entry.provider === "openrouter" && OPENROUTER_REASONING_MODEL.test(entry.model)
        ? { reasoning: { enabled: false } }
        : {}),
      maxTokens: 4000,
    });
  }
  return { configs, skipped };
}

/**
 * The chain used when `AI_PROVIDER_CHAIN` is not set.
 *
 * User instruction, 2026-10-20: use NVIDIA first and keep the chain short — the
 * previous five-entry Groq-first chain spent the whole run budget walking models
 * that were blocked or returned the wrong number of tasks.
 *
 *   1. NVIDIA Nemotron 3.5 Lightning — the requested primary, on the direct
 *      NVIDIA endpoint. Thinking is disabled in `resolveChain`; with it on the
 *      model spends all 4000 tokens reasoning and returns nothing.
 *   2-4. OpenRouter free models, in the operator's stated order. These are
 *      shared-capacity fallbacks, never primaries: the same model can succeed
 *      and fail minutes apart. `thinkingmachines/inkling:free` currently answers
 *      403 "only available on agentic harnesses"; it is kept because the
 *      operator asked for that exact roster, and the 403 is classified as a
 *      per-entry `unavailable` so the chain advances instead of aborting.
 */
export const DEFAULT_CHAIN: readonly ChainEntry[] = [
  { provider: "nvidia", model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { provider: "openrouter", model: "thinkingmachines/inkling:free" },
  { provider: "openrouter", model: "google/gemma-4-31b-it:free" },
] as const;

/** True when the operator explicitly asked for a chain that cannot be used. */
export function chainIsExplicit(env: EnvLike = process.env): boolean {
  return parseChain(env.AI_PROVIDER_CHAIN).length > 0;
}

/**
 * The chain to use: `AI_PROVIDER_CHAIN` if set, else the default chain.
 *
 * An empty result means "no live provider configured" and the caller falls back
 * to the mock. `AI_PROVIDER` is still honoured for the legacy single-provider
 * path so existing deployments keep working, but it is no longer REQUIRED: a
 * deployment that only has `NVIDIA_API_KEY` set gets the live model, which is
 * what makes the chain genuinely optional rather than a config step to remember.
 */
export function chainFromEnv(env: EnvLike = process.env): ChainEntry[] {
  const parsed = parseChain(env.AI_PROVIDER_CHAIN);
  if (parsed.length > 0) return parsed;

  const single = (env.AI_PROVIDER || "").trim().toLowerCase();
  // `mock` is an explicit operator choice and wins outright, even with a key
  // present. An operator who pinned the offline provider must not be pushed
  // onto a paid API because a key happens to be exported in their shell — and
  // the test suite depends on this to stay offline (see package.json test).
  if (single === "mock") return [];
  if (single && single in DEFAULTS) {
    const provider = single as ChainEntry["provider"];
    const spec = SINGLE_PROVIDER_MODEL[provider];
    return [{ provider, model: env[spec.envVar] || spec.model }];
  }

  // No chain configured. Keep only default-chain entries whose key is present:
  // listing an entry with no key would make resolveChain skip it anyway, and a
  // Groq-only deployment (no entry in the current default) would otherwise see
  // every entry skipped rather than falling through to its own provider.
  const configured = DEFAULT_CHAIN.filter((e) => (env[DEFAULTS[e.provider].keyVar] ?? "").trim() !== "");
  if (configured.length > 0) return [...configured];

  // A key for a provider outside the default chain still means "go live": the
  // user pasted it precisely because they want a model, and silently falling
  // back to mock text would look like success while producing test-double prose.
  const providers: ChainEntry["provider"][] = ["nvidia", "openrouter", "groq", "openai"];
  for (const provider of providers) {
    if ((env[DEFAULTS[provider].keyVar] ?? "").trim() === "") continue;
    const spec = SINGLE_PROVIDER_MODEL[provider];
    return [{ provider, model: env[spec.envVar] || spec.model }];
  }
  return [];
}