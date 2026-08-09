// Seed governance metadata for guide configurations (PRD 19.3, 30).
// Rule payloads live in src/data/guides.ts for the MVP; this table records
// the version + source reference per grade so saved exams are traceable.

import { PrismaClient } from "@prisma/client";
import { GUIDES } from "../src/data/guides";

const prisma = new PrismaClient();

async function main() {
  for (const g of Object.values(GUIDES)) {
    await prisma.guideConfig.upsert({
      where: { key: g.key },
      update: {
        name: g.name,
        version: g.version,
        language: g.language,
        sourceRef: g.sourceRef,
        active: true,
        data: JSON.stringify({
          marks: g.marks,
          lengthOptions: g.lengthOptions,
          partOneFamilies: g.partOne.map((p) => p.family),
          skillCategories: g.textExploration.skills.map((s) => s.skill),
          writingForms: g.writing.forms,
        }),
      },
      create: {
        key: g.key,
        name: g.name,
        version: g.version,
        language: g.language,
        sourceRef: g.sourceRef,
        active: true,
        data: JSON.stringify({
          marks: g.marks,
          lengthOptions: g.lengthOptions,
          partOneFamilies: g.partOne.map((p) => p.family),
          skillCategories: g.textExploration.skills.map((s) => s.skill),
          writingForms: g.writing.forms,
        }),
      },
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
