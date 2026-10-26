#!/usr/bin/env node
// Live model test: calls each configured chain entry with a real passage
// generation request, then validates the result with the SAME validator
// generateFullExam uses (paragraph count, word band, paragraph balance).
//
// This is the script that produced the 2026-10-26 provider decision: Groq
// `openai/gpt-oss-120b` returns valid 3-paragraph / 120-180 word passages
// consistently, while NVIDIA Nemotron 3.5 Lightning returns 1 paragraph of
// ~43 words on every attempt, repair included.
//
// Requires real keys. Reads them from `.env.local`, which Prisma and the app
// do not load, so it is parsed here before any module is imported.
//
//   npx tsx scripts/test-models.ts
//
// Exits 1 when no tested model passes, so it can gate a provider change.

import * as fs from "node:fs";
import * as path from "node:path";

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local — this script needs real provider keys.");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { buildContext, validateCandidate } = await import("../src/lib/generate/index");
  const { createCompatibleGenerators } = await import("../src/lib/generate/provider");
  const { chainFromEnv, resolveChain } = await import("../src/lib/generate/chain");

  const entries = chainFromEnv();
  console.log("Chain entries:", entries.map((e) => `${e.provider}:${e.model}`).join(", ") || "(empty)");

  const { configs, skipped } = resolveChain(entries);
  for (const s of skipped) {
    console.log(`Skipped (no key): ${s.entry.provider}:${s.entry.model} (${s.reason})`);
  }

  const ctx = buildContext({
    level: "secondary",
    grade: "3as",
    stream: null,
    length: 150,
    unit: "u-ancient",
    topic: "Exploring the ancient world",
    examId: "live-test-001",
    language: "en",
  });

  // Always measure Groq even when AI_PROVIDER_CHAIN narrows the chain, so the
  // documented primary cannot silently drop out of this report.
  const allConfigs = [...configs];
  if (process.env.GROQ_API_KEY) {
    const [groqCfg] = resolveChain([
      { provider: "groq", model: process.env.GROQ_MODEL || "openai/gpt-oss-120b" },
    ]).configs;
    if (groqCfg && !allConfigs.some((c) => c.entry.provider === "groq" && c.model === groqCfg.model)) {
      allConfigs.push(groqCfg);
    }
  }

  const results: Array<{ label: string; ok: boolean; reason: string; words: number; paragraphs: number }> = [];

  for (const cfg of allConfigs) {
    const label = `${cfg.providerLabel}:${cfg.model}`;
    console.log(`\n=== ${label} ===`);
    try {
      const impl = createCompatibleGenerators(() => cfg);
      const [first] = await impl.generateTextCandidates(ctx);
      if (!first) {
        console.log("FAIL: no candidate returned");
        results.push({ label, ok: false, reason: "no candidate", words: 0, paragraphs: 0 });
        continue;
      }

      const check = validateCandidate("TEXT", { text: first.text, title: first.title }, undefined, {
        length: ctx.length,
        paragraphCount: ctx.paragraphCount,
        topic: ctx.topic,
        teacherKeywords: ctx.teacherKeywords,
      });
      const words = first.text.split(/\s+/).filter(Boolean).length;
      const paragraphs = first.text.split(/\n{2,}/).filter((p) => p.trim()).length;
      console.log(`Title: ${first.title}`);
      console.log(`Words: ${words} (expected 120-180)`);
      console.log(`Paragraphs: ${paragraphs} (expected ${ctx.paragraphCount})`);
      console.log(`Issues: ${check.ok ? "NONE" : check.issues.join("; ")}`);
      console.log(check.ok ? "PASS" : "FAIL");
      results.push({ label, ok: check.ok, reason: check.issues.join(" | "), words, paragraphs });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log(`ERROR: ${message}`);
      results.push({ label, ok: false, reason: message, words: 0, paragraphs: 0 });
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`${r.label}: ${r.ok ? "PASS" : "FAIL"} (words=${r.words}, paras=${r.paragraphs}, reason=${r.reason || "-"})`);
  }
  const reliable = results.filter((r) => r.ok).map((r) => r.label);
  console.log(`\nReliable models: ${reliable.join(", ") || "NONE"}`);
  process.exit(reliable.length > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
