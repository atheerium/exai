// Provider fallback chain.
//
// One env string names an ordered list of provider entries, e.g.
//   AI_PROVIDER_CHAIN="groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,openrouter:qwen/qwen3.8-27b:free"
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

/** Error classes the advance policy keys off. */
export type ChainFailure = "auth" | "throttle" | "server" | "content" | "validation";

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

/** Classify a thrown error so the caller can decide whether to advance. */
export function classifyFailure(e: unknown): ChainFailure {
  const msg = String((e as { message?: string })?.message ?? e);
  const lower = msg.toLowerCase();

  if (/\b(401|403)\b/.test(lower) || /unauthorized|forbidden|invalid api key/.test(lower)) return "auth";
  if (/abort|timed? ?out|etimedout|econnreset|network|fetch failed|socket hang up|enotfound|econnrefused/.test(lower))
    return "throttle";
  if (/\b(429|500|502|503|504)\b/.test(lower) || /rate limit|overloaded|temporarily unavailable/.test(lower))
    return "throttle";
  if (/invalid json|no content|missing /.test(lower)) return "content";
  return "server";
}

/** True when advancing to another entry could plausibly help. */
export function shouldAdvance(failure: ChainFailure): boolean {
  return failure === "throttle" || failure === "server" || failure === "content";
}

const DEFAULTS: Record<ChainEntry["provider"], { baseUrl: string; keyVar: string; label: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY", label: "groq" },
  openai: { baseUrl: "https://api.openai.com/v1", keyVar: "OPENAI_API_KEY", label: "openai" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY", label: "openrouter" },
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", keyVar: "NVIDIA_API_KEY", label: "nvidia" },
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
      maxTokens: 4000,
    });
  }
  return { configs, skipped };
}

/** The chain to use: env chain if set, else the legacy single `AI_PROVIDER`. */
export function chainFromEnv(env: EnvLike = process.env): ChainEntry[] {
  const parsed = parseChain(env.AI_PROVIDER_CHAIN);
  if (parsed.length > 0) return parsed;

  // Legacy single-provider path, so existing deployments keep working and the
  // Groq default fix (a dead llama ID) still takes effect.
  const single = (env.AI_PROVIDER || "mock").toLowerCase();
  if (single === "mock") return [];
  if (single in DEFAULTS) {
    const provider = single as ChainEntry["provider"];
    const model =
      provider === "groq"
        ? env.GROQ_MODEL || "openai/gpt-oss-120b"
        : provider === "openai"
          ? env.OPENAI_MODEL || "gpt-4o-mini"
          : provider === "openrouter"
            ? env.OPENROUTER_MODEL || "openai/gpt-oss-120b"
            : env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b";
    return [{ provider, model }];
  }
  return [];
}