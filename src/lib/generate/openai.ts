// OpenAI-compatible generation provider.
//
// Implements the same facade as the mock provider (see index.ts), but calls a
// chat-completions API with JSON output and validates every response before it
// can reach the teacher. Only the credentials/base URL/model differ from the
// other compatible providers; prompts and parsing are shared in provider.ts.
// Configure with:
//   AI_PROVIDER=openai
//   OPENAI_API_KEY=...
//   OPENAI_MODEL=gpt-4o-mini          (optional)
//   OPENAI_BASE_URL=https://.../v1   (optional; OpenAI-compatible endpoint)

import { createCompatibleGenerators, type ProviderConfig } from "./provider";

function config(): ProviderConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    providerLabel: "openai",
  };
}

const impl = createCompatibleGenerators(config);

export const generateTextCandidates = impl.generateTextCandidates;
export const generatePartOneCandidates = impl.generatePartOneCandidates;
export const generateTextExplorationCandidates = impl.generateTextExplorationCandidates;
export const generateRewriteCandidates = impl.generateRewriteCandidates;
export const generateWritingCandidates = impl.generateWritingCandidates;