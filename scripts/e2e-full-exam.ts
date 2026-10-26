#!/usr/bin/env node
// Live soak test: generate a complete exam, for real, once per grade.
//
// The unit tests prove the WIRING (see `src/lib/generate/ladder.test.ts`). This
// proves the THING THE TEACHER PRESSES: `generateFullExam` against the real
// provider chain, on every curriculum path, with the real validator.
//
// It is deliberately not part of `npm test` — the suite must never make a
// network call (AGENTS.md), and a free tier costs ~7K tokens per exam, which is
// roughly two exams a minute on Groq's 8000 TPM ceiling.
//
//   npx tsx scripts/e2e-full-exam.ts                 # every grade, ~2s pause
//   npx tsx scripts/e2e-full-exam.ts --runs 2        # two passes over all grades
//   npx tsx scripts/e2e-full-exam.ts --grades 3as,1am
//   npx tsx scripts/e2e-full-exam.ts --chain "groq:openai/gpt-oss-120b"
//
// Exits 1 if ANY grade fails, so it can gate a provider or prompt change.

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

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  loadEnvLocal();

  // Test the chain the code will actually use unless an operator overrode it.
  // `AI_PROVIDER` is cleared because it wins over everything: a stray pin in the
  // shell would otherwise hide a broken default chain.
  delete process.env.AI_PROVIDER;
  const chain = arg("chain", "");
  if (chain) process.env.AI_PROVIDER_CHAIN = chain;
  else delete process.env.AI_PROVIDER_CHAIN;

  const runs = Number(arg("runs", "1"));
  const pauseMs = Number(arg("pause", "2000"));
  const only = arg("grades", "").split(",").filter(Boolean);

  const { generateFullExam } = await import("../src/lib/generate/full-exam");
  const { servingProvider } = await import("../src/lib/generate/index");
  const { chainFromEnv } = await import("../src/lib/generate/chain");
  const { GRADES, getGuide } = await import("../src/data/guides");

  console.log("Chain:", chainFromEnv().map((e) => `${e.provider}:${e.model}`).join(", ") || "(mock)");
  console.log(`Budget per run: ${process.env.AI_RUN_BUDGET_MS ?? "120000 (default)"}ms`);

  const grades = Object.keys(GRADES).filter((g) => only.length === 0 || only.includes(g));
  const failures: string[] = [];
  let index = 0;
  const total = grades.length * runs;

  for (let pass = 0; pass < runs; pass++) {
    for (const grade of grades) {
      index += 1;
      const gradeDef = GRADES[grade]!;
      const stream = gradeDef.streams?.[0] ?? null;
      const unit =
        gradeDef.units.find((u) => !u.streams || !stream || u.streams.includes(stream)) ?? gradeDef.units[0];
      const guide = getGuide(grade, "en", stream ?? undefined)!;
      const examId = `soak-${grade}-${pass}-${Date.now()}`;

      const started = Date.now();
      const result = await generateFullExam({
        level: gradeDef.level,
        grade,
        stream,
        length: guide.defaultLength,
        unit: unit.key,
        topic: unit.topics[0],
        examId,
        singleTopic: guide.structure === "bem",
      });
      const ms = Date.now() - started;
      const served = servingProvider();

      if (result.ok) {
        const words = result.text!.text.split(/\s+/).filter(Boolean).length;
        const paras = result.text!.text.split(/\n{2,}/).filter((p) => p.trim()).length;
        console.log(
          `[${index}/${total}] PASS ${grade.padEnd(4)} ${String(ms).padStart(6)}ms  ${served.padEnd(38)} ${words}w/${paras}p`
        );
      } else {
        const detail = result.issues.map((i) => `${i.section}: ${i.messages.join("; ")}`).join(" | ");
        console.log(`[${index}/${total}] FAIL ${grade.padEnd(4)} ${String(ms).padStart(6)}ms  ${served}`);
        console.log(`           ${detail}`);
        failures.push(`${grade}: ${detail}`);
      }

      if (index < total) await new Promise((r) => setTimeout(r, pauseMs));
    }
  }

  console.log(`\n${total - failures.length}/${total} exams generated`);
  if (failures.length > 0) {
    console.log("\nFAILURES");
    for (const f of failures) console.log(` - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
