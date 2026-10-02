// Seed governance metadata for guide configurations (PRD 19.3, 30).
// Rule payloads live in src/data/guides.ts for the MVP; this table records
// the version + source reference per grade so saved exams are traceable.

import { PrismaClient } from "@prisma/client";
import { GUIDES } from "../src/data/guides";

const prisma = new PrismaClient();

async function main() {
  for (const g of Object.values(GUIDES)) {
    // One source for both upsert branches: an upsert takes `update` for rows
    // that already exist and `create` for the rest, so duplicating the payload
    // let the two drift and leave existing rows permanently stale.
    const data = JSON.stringify({
      marks: g.marks,
      lengthOptions: g.lengthOptions,
      partOneFamilies: g.partOne.map((p) => p.family),
      skillCategories: g.textExploration.skills.map((s) => s.skill),
      writingForms: g.writing.forms,
    });
    const governance = {
      name: g.name,
      version: g.version,
      language: g.language,
      sourceRef: g.sourceRef,
      active: true,
      data,
    };
    await prisma.guideConfig.upsert({
      where: { key: g.key },
      update: governance,
      create: { key: g.key, ...governance },
    });
  }
  console.log(`Seeded ${Object.keys(GUIDES).length} guide configurations.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
