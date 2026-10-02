// Groq generation provider.
//
// Same OpenAI-compatible chat-completions API shape as openai.ts, but routed
// through Groq's hosted inference. Only the credentials/base URL/model differ;
// prompts and parsing are shared in provider.ts. Configure with:
//   AI_PROVIDER=groq
//   GROQ_API_KEY=...
//   GROQ_MODEL=llama-3.3-70b-versatile   (optional)
//   GROQ_BASE_URL=https://api.groq.com/openai/v1   (optional)

import { createCompatibleGenerators, type ProviderConfig } from "./provider";

function config(): ProviderConfig {
  return {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    providerLabel: "groq",
  };
}

const impl = createCompatibleGenerators(config);

export const generateTextCandidates = impl.generateTextCandidates;
export const generatePartOneCandidates = impl.generatePartOneCandidates;
export const generateTextExplorationCandidates = impl.generateTextExplorationCandidates;
export const generateRewriteCandidates = impl.generateRewriteCandidates;
export const generateWritingCandidates = impl.generateWritingCandidates;