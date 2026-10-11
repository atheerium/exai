// Groq generation provider.
//
// Same OpenAI-compatible chat-completions API shape as openai.ts, but routed
// through Groq's hosted inference. Only the credentials/base URL/model differ;
// prompts and parsing are shared in provider.ts. Configure with:
//   AI_PROVIDER=groq
//   GROQ_API_KEY=...
//   GROQ_MODEL=openai/gpt-oss-120b   (optional)
//   GROQ_BASE_URL=https://api.groq.com/openai/v1   (optional)
//
// MODEL ROSTER WARNING — verified against a live key on 2026-10-11. Groq serves
// exactly three chat models on the free plan: `openai/gpt-oss-120b`,
// `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`. Every `meta-llama/*` chat model was
// removed from the free/developer tiers on 2026-08-16, so the old default here
// (`llama-3.3-70b-versatile`) returned 404/429 for every free key. The roster
// churns quarterly; check https://console.groq.com/docs/models before changing
// this default, and never trust a tutorial's model string.
//
// Note `chain.ts` sets reasoningEffort automatically for gpt-oss models, so
// this file is only used on the legacy single-provider path.

import { createCompatibleGenerators, type ProviderConfig } from "./provider";

function config(): ProviderConfig {
  return {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    // gpt-oss is a reasoning model: without reasoning_effort it spends the whole
    // max_tokens budget on reasoning and returns empty content (measured 0/6
    // success without, 6/6 with).
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    providerLabel: "groq",
    reasoningEffort: "low",
    maxTokens: 4000,
  };
}

const impl = createCompatibleGenerators(config);

export const generateTextCandidates = impl.generateTextCandidates;
export const generatePartOneCandidates = impl.generatePartOneCandidates;
export const generateTextExplorationCandidates = impl.generateTextExplorationCandidates;
export const generateRewriteCandidates = impl.generateRewriteCandidates;
export const generateWritingCandidates = impl.generateWritingCandidates;