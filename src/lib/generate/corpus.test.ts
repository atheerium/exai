import { test } from "node:test";
import assert from "node:assert/strict";
import { GRADES, getGuide } from "../../data/guides";
import { generateText, generatePartOne, generateTextExploration, generateWriting } from "./mock";

// Safety net over the entire content corpus: every grade x unit must generate
// structurally valid exams (text length, mark totals, five skills, keywords).

test("corpus: every grade x unit generates valid exam content", () => {
  let combos = 0;
  for (const gradeKey of Object.keys(GRADES)) {
    const grade = GRADES[gradeKey];
    const guide = getGuide(gradeKey);
    for (const unit of grade.units) {
      const topic = unit.topics[0];
      const ctx = {
        grade: gradeKey,
        unit: unit.label,
        topic,
        length: 150,
        guide,
        themeKey: unit.theme,
        seed: `corpus:${gradeKey}:${unit.key}:${topic}`,
      };
      combos += 1;

      const text = generateText(ctx, 0);
      assert.ok(text.title.length > 0, `${gradeKey}/${unit.key}: empty title`);
      assert.ok(text.words >= 100 && text.words <= 300, `${gradeKey}/${unit.key}: words ${text.words}`);
      assert.ok(text.text.includes(topic.split(" ")[0].toLowerCase()), `${gradeKey}/${unit.key}: topic not in text`);

      const p1 = generatePartOne(ctx, 0);
      assert.equal(p1.length, 4, `${gradeKey}/${unit.key}: part one task count`);
      assert.ok(Math.abs(p1.reduce((s, t) => s + t.marks, 0) - 7) < 1e-9, `${gradeKey}/${unit.key}: part one marks`);

      const p2 = generateTextExploration(ctx, 0);
      assert.equal(p2.length, 5, `${gradeKey}/${unit.key}: text exploration task count`);
      assert.equal(
        new Set(p2.map((t) => t.skill)).size,
        5,
        `${gradeKey}/${unit.key}: skills ${p2.map((t) => t.skill).join(",")}`
      );
      assert.ok(Math.abs(p2.reduce((s, t) => s + t.marks, 0) - 8) < 1e-9, `${gradeKey}/${unit.key}: p2 marks`);

      const { guided, free } = generateWriting(ctx, 0);
      assert.ok(guided.keywords?.includes("/"), `${gradeKey}/${unit.key}: guided keywords`);
      assert.equal(free.keywords, undefined, `${gradeKey}/${unit.key}: free keywords`);
    }
  }
  assert.ok(combos >= 25, `expected >= 25 grade/unit combos, got ${combos}`);
  console.log(`corpus ok: ${combos} grade x unit combinations`);
});
