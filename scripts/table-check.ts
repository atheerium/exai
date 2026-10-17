// Render one page holding all three official B structures, so the grid, the row
// height, the dotted cells and the IPA headers can be inspected in a rasterised
// PDF rather than trusted from the code. No database: the content model is
// assembled here.
//
//   npx tsx scripts/table-check.ts
//   pdftoppm -r 130 -png /tmp/opencode/examcheck/tables.pdf /tmp/opencode/examcheck/tables

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { renderPdf } from "../src/lib/export/pdf";
import { renderDocx } from "../src/lib/export/docx";
import type { ExportDocument } from "../src/lib/export/assemble";

const OUT = "/tmp/opencode/examcheck";
mkdirSync(OUT, { recursive: true });

const derivation = {
  headers: ["Verb", "Noun", "Adjective"],
  rows: [
    ["to corrupt", "corruption", "corrupt"],
    ["to defraud", "...................", "..................."],
    ["...................", "communication", "..................."],
    ["...................", "...................", "fraudulent"],
  ],
};

const doc: ExportDocument = {
  title: "Table check",
  subtitle: "",
  meta: [],
  header: null,
  structure: "bac",
  generatedBy: "Generated with Exaai",
  sections: [
    { sectionType: "TEXT", heading: "Part One: Reading.", marksLabel: "(14 pts)", tasks: [], topics: [] },
    {
      sectionType: "PART_ONE",
      heading: "A/ Comprehension.",
      marksLabel: "(07 pts)",
      tasks: [],
      topics: [],
    },
    {
      sectionType: "TEXT_EXPLORATION",
      heading: "B/ Text Exploration.",
      marksLabel: "(07 pts)",
      tasks: [
        {
          instruction: "Divide the following words into roots and affixes:",
          prompt: "List: [excavation, collaborative, unfaithful]",
          marks: "1.5",
          skill: "MORPHOLOGY",
          table: { headers: ["prefix", "root", "suffix"], rows: [["", "", ""]] },
        },
        {
          instruction:
            "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words.",
          prompt: "1. \"fraudulent\"\n2. \"communication\"\n3. \"to value\"",
          marks: "1.5",
          skill: "MORPHOLOGY",
          table: derivation,
        },
        {
          instruction: "Classify the following words according to the pronunciation of the final /ed/.",
          prompt: "List: [watched, agreed, wanted, needed]\nClassify the following words.",
          marks: "1",
          skill: "PHONOLOGY",
          table: { headers: ["/t/", "/d/", "/ɪd/"], rows: [["", "", ""]] },
        },
        {
          instruction: "Classify the following words according to the pronunciation of the final /s/.",
          prompt: "List: [books, cars, churches, boxes]\nClassify the following words.",
          marks: "1",
          skill: "PHONOLOGY",
          table: { headers: ["/s/", "/z/", "/ɪz/"], rows: [["", "", ""]] },
        },
      ],
      topics: [],
    },
    { sectionType: "WRITING", heading: "Part Two: Written Expression.", marksLabel: "(06 pts)", tasks: [], topics: [] },
  ],
};

async function main() {
  const pdf = await renderPdf(doc);
  writeFileSync(join(OUT, "tables.pdf"), pdf);
  writeFileSync(join(OUT, "tables.docx"), await renderDocx(doc));
  console.log(`wrote ${join(OUT, "tables.pdf")}`);
}

void main();
