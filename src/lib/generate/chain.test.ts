// Fallback chain: parsing, resolution and the advance policy.
//
// No network, by design — AGENTS.md records that the suite must never call a
// real provider. Everything here is pure functions over env-shaped input.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseChain,
  resolveChain,
  chainFromEnv,
  classifyFailure,
  shouldAdvance,
  type ChainEntry,
  type EnvLike,
} from "./chain";

test("parseChain reads provider:model pairs in order", () => {
  const entries = parseChain("groq:openai/gpt-oss-120b,openrouter:qwen/qwen3.8-27b:free");
  assert.deepEqual(entries, [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "openrouter", model: "qwen/qwen3.8-27b:free" },
  ]);
});

test("parseChain tolerates whitespace and drops junk entries", () => {
  const entries = parseChain(
    " groq:openai/gpt-oss-120b , nonsense , :no-model , openai: , unknownprov:x , , nvidia:abc "
  );
  assert.deepEqual(entries, [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "nvidia", model: "abc" },
  ]);
});

test("parseChain returns empty for unset or blank", () => {
  assert.deepEqual(parseChain(undefined), []);
  assert.deepEqual(parseChain(""), []);
  assert.deepEqual(parseChain("   "), []);
});

test("resolveChain skips entries with no key and keeps the rest", () => {
  const entries: ChainEntry[] = [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "openrouter", model: "some/model:free" },
    { provider: "nvidia", model: "nvidia/nemotron-3-super" },
  ];
  const { configs, skipped } = resolveChain(entries, {
    GROQ_API_KEY: "k1",
    NVIDIA_API_KEY: "k3",
  });
  assert.equal(configs.length, 2, "the entry without a key is skipped");
  assert.deepEqual(configs.map((c) => c.providerLabel), ["groq", "nvidia"]);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /OPENROUTER_API_KEY/);
});

test("resolveChain caps reasoning for gpt-oss and leaves others alone", () => {
  // Measured on Groq 2026-10-11: without a reasoning cap gpt-oss returns empty
  // content (0/6) and Groq reports a JSON validation failure; with it, 6/6.
  const { configs } = resolveChain(
    [
      { provider: "groq", model: "openai/gpt-oss-120b" },
      { provider: "nvidia", model: "nvidia/nemotron-3-super-120b-a12b" },
    ],
    { GROQ_API_KEY: "k", NVIDIA_API_KEY: "k" } satisfies EnvLike
  );
  assert.equal(configs[0].reasoningEffort, "low", "gpt-oss must be capped");
  assert.equal(configs[1].reasoningEffort, undefined, "nemotron tolerates none");
  assert.ok((configs[0].maxTokens ?? 0) >= 4000, "a generous budget is required");
});

test("resolveChain honours a per-provider base URL override", () => {
  const { configs } = resolveChain([{ provider: "groq", model: "m" }], {
    GROQ_API_KEY: "k",
    GROQ_BASE_URL: "https://proxy.internal/v1/",
  });
  assert.equal(configs[0].baseUrl, "https://proxy.internal/v1", "trailing slash trimmed");
});

test("classifyFailure separates auth from throttling", () => {
  assert.equal(classifyFailure(new Error("AI provider error 401: bad key")), "auth");
  assert.equal(classifyFailure(new Error("AI provider error 403")), "auth");
  assert.equal(classifyFailure(new Error("AI provider error 429: rate limit")), "throttle");
  assert.equal(classifyFailure(new Error("Upstream error from Nvidia: Service temporarily overloaded")), "throttle");
  assert.equal(classifyFailure(new Error("AI provider error 503")), "throttle");
  assert.equal(classifyFailure(new Error("The operation was aborted due to timeout")), "throttle");
  assert.equal(classifyFailure(new Error("AI provider returned invalid JSON.")), "content");
  assert.equal(classifyFailure(new Error("AI provider returned no content (model used 400 reasoning tokens...)")), "content");
  assert.equal(classifyFailure(new Error("something else entirely")), "server");
});

test("advance policy: never advance past an auth or validation failure", () => {
  // Advancing on 401 turns one clear credential error into a confusing one and
  // burns the fallback quota while failing anyway.
  assert.equal(shouldAdvance("auth"), false);
  assert.equal(shouldAdvance("validation"), false);
  assert.equal(shouldAdvance("throttle"), true);
  assert.equal(shouldAdvance("server"), true);
  assert.equal(shouldAdvance("content"), true);
});

test("chainFromEnv prefers the chain over the legacy single provider", () => {
  const env = {
    AI_PROVIDER: "groq",
    AI_PROVIDER_CHAIN: "groq:openai/gpt-oss-120b,nvidia:nvidia/nemotron-3-super",
  } satisfies EnvLike;
  assert.deepEqual(chainFromEnv(env), [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "nvidia", model: "nvidia/nemotron-3-super" },
  ]);
});

test("chainFromEnv returns empty for mock so the offline provider stays default", () => {
  assert.deepEqual(chainFromEnv({ AI_PROVIDER: "mock" }), []);
  assert.deepEqual(chainFromEnv({} satisfies EnvLike), []);
});

test("legacy Groq default is a live model, not the removed Llama", () => {
  // groq.ts shipped defaulting to llama-3.3-70b-versatile, which Groq removed
  // from free tiers on 2026-08-16. Pin it so the exact rot cannot recur.
  const [entry] = chainFromEnv({ AI_PROVIDER: "groq" });
  assert.ok(entry, "groq resolves to a chain entry");
  assert.doesNotMatch(entry.model, /^meta-llama\//, "no meta-llama chat model is served on the free plan");
  assert.equal(entry.model, "openai/gpt-oss-120b");
});

test("a full chain resolves end to end with all three keys present", () => {
  const entries = parseChain(
    "groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,openrouter:nvidia/nemotron-3-ultra-550b-a55b:free,nvidia:nvidia/nemotron-3-super-120b-a12b"
  );
  const { configs, skipped } = resolveChain(entries, {
    GROQ_API_KEY: "a",
    OPENROUTER_API_KEY: "b",
    NVIDIA_API_KEY: "c",
  });
  assert.equal(configs.length, 4);
  assert.equal(skipped.length, 0);
  assert.deepEqual(
    configs.map((c) => c.baseUrl),
    [
      "https://api.groq.com/openai/v1",
      "https://api.groq.com/openai/v1",
      "https://openrouter.ai/api/v1",
      "https://integrate.api.nvidia.com/v1",
    ],
    "each provider keeps its own default endpoint"
  );
});