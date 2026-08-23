import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfigInputs, resolveRules, curriculumCatalog, getThemeFor } from "./guide";
import { GUIDES, getGuide, getAvailableLanguages, languagesFromGuides, type Guide } from "../data/guides";

const base = {
  level: "secondary",
  grade: "3as",
  stream: "Lettres et Langues Étrangères",
  length: 150,
  unit: "u-education",
  topic: "The future of education",
};

test("validateConfigInputs accepts a valid configuration", () => {
  assert.equal(validateConfigInputs(base), true);
});

test("validateConfigInputs rejects missing required fields", () => {
  assert.throws(() => validateConfigInputs({ ...base, topic: "" }), /Missing required/);
  assert.throws(() => validateConfigInputs({ ...base, grade: "" }), /Missing required/);
});

test("validateConfigInputs rejects disallowed lengths", () => {
  assert.throws(() => validateConfigInputs({ ...base, length: 999 }), /Length/);
  assert.throws(() => validateConfigInputs({ ...base, length: 175 }), /Length/);
});

test("validateConfigInputs rejects grade/level mismatch", () => {
  assert.throws(() => validateConfigInputs({ ...base, level: "middle" }), /does not belong/);
});

test("validateConfigInputs rejects a stream not valid for the grade", () => {
  assert.throws(() => validateConfigInputs({ ...base, stream: "Tronc commun Lettres" }), /not valid/);
});

test("resolveRules resolves the right guide and unit for the grade", () => {
  const r = resolveRules(base);
  assert.equal(r.guide.key, "3as");
  assert.equal(r.guide.marks.partOne + r.guide.marks.textExploration + r.guide.marks.writing, 20);
  assert.equal(r.themeKey, "school"); // u-education maps to the school theme
  assert.equal(r.length, 150);
});

test("resolveRules rejects a length outside the guide options", () => {
  assert.throws(() => resolveRules({ ...base, length: 999 }), /not allowed/);
});

test("curriculumCatalog lists both levels with all grades", () => {
  const c = curriculumCatalog();
  assert.deepEqual(Object.keys(c).sort(), ["middle", "secondary"]);
  const middle = c.middle.map((g) => g.grade);
  const secondary = c.secondary.map((g) => g.grade);
  assert.deepEqual(middle, ["1am", "2am", "3am", "4am"]);
  assert.deepEqual(secondary, ["1as", "2as", "3as"]);
});

test("getThemeFor resolves a unit theme", () => {
  const theme = getThemeFor({ grade: "3as", unit: "u-education" });
  assert.ok(theme.body.length >= 6);
  assert.ok(theme.vocab.length >= 6);
});

test("language seam is data-driven (PRD 38.1/38.3)", () => {
  assert.deepEqual(getAvailableLanguages(), ["en"]);
  const synthetic: Record<string, Guide> = {
    ...GUIDES,
    "fr-3as": { ...GUIDES["3as"], key: "fr-3as", name: "French 3 AS (synthetic)", language: "fr" },
  };
  assert.deepEqual(languagesFromGuides(synthetic), ["en", "fr"]);
});

test("every guide declares a language", () => {
  for (const g of Object.values(GUIDES)) {
    assert.ok(typeof g.language === "string" && g.language.length > 0, g.key);
  }
});

test("guide resolution is language-aware (PRD 38.1)", () => {
  assert.equal(getGuide("3as", "fr").language, "en");
  (GUIDES as Record<string, Guide>)["fr-3as"] = {
    ...GUIDES["3as"],
    key: "fr-3as",
    name: "French 3 AS (synthetic)",
    language: "fr",
  };
  try {
    assert.equal(getGuide("3as", "fr").key, "fr-3as");
    assert.equal(getGuide("3as", "fr").language, "fr");
    assert.equal(getGuide("3as", "en").key, "3as");
    const r = resolveRules({ ...base, language: "fr" });
    assert.equal(r.guide.key, "fr-3as");
    assert.equal(r.language, "fr");
  } finally {
    delete (GUIDES as Record<string, Guide>)["fr-3as"];
  }
});

test("2AS scientific stream resolves a 4-unit list without Signs of the Time", () => {
  const c = curriculumCatalog();
  const as2 = c.secondary.find((g) => g.grade === "2as")!;
  const sciUnits = as2.units.filter(
    (u) => !u.streams || u.streams.includes("Sciences Expérimentales")
  );
  assert.equal(sciUnits.length, 4);
  assert.ok(!sciUnits.some((u) => u.key === "u-signs"), "Signs of the Time should not appear for sciences");
  assert.ok(sciUnits.some((u) => u.key === "u-peace"));
  assert.ok(sciUnits.some((u) => u.key === "u-waste"));
  assert.ok(sciUnits.some((u) => u.key === "u-scientist-sc"));
  assert.ok(sciUnits.some((u) => u.key === "u-island-sc"));
});

test("2AS literary stream resolves 6-unit list including Signs of the Time", () => {
  const c = curriculumCatalog();
  const as2 = c.secondary.find((g) => g.grade === "2as")!;
  const litUnits = as2.units.filter(
    (u) => !u.streams || u.streams.includes("Lettres et Langues Étrangères")
  );
  assert.equal(litUnits.length, 6);
  assert.ok(litUnits.some((u) => u.key === "u-signs"));
  assert.ok(litUnits.some((u) => u.key === "u-fiction"));
});

test("2AS GE stream resolves 4-unit list with Business Is Business", () => {
  const c = curriculumCatalog();
  const as2 = c.secondary.find((g) => g.grade === "2as")!;
  const geUnits = as2.units.filter(
    (u) => !u.streams || u.streams.includes("Gestion et Économie")
  );
  assert.equal(geUnits.length, 4);
  assert.ok(geUnits.some((u) => u.key === "u-business"));
  assert.ok(!geUnits.some((u) => u.key === "u-signs"), "Signs of the Time should not appear for GE");
});

test("3AS literary stream resolves 4-unit list with Ancient Civilization", () => {
  const c = curriculumCatalog();
  const as3 = c.secondary.find((g) => g.grade === "3as")!;
  const litUnits = as3.units.filter(
    (u) => !u.streams || u.streams.includes("Lettres et Philosophie")
  );
  assert.equal(litUnits.length, 4);
  assert.ok(litUnits.some((u) => u.key === "u-ancient"));
  assert.ok(litUnits.some((u) => u.key === "u-ethics"));
  assert.ok(litUnits.some((u) => u.key === "u-education"));
  assert.ok(litUnits.some((u) => u.key === "u-feelings-lit"));
});

test("3AS scientific stream resolves 4-unit list with Astronomy", () => {
  const c = curriculumCatalog();
  const as3 = c.secondary.find((g) => g.grade === "3as")!;
  const sciUnits = as3.units.filter(
    (u) => !u.streams || u.streams.includes("Sciences Expérimentales")
  );
  assert.equal(sciUnits.length, 4);
  assert.ok(sciUnits.some((u) => u.key === "u-astronomy"));
  assert.ok(sciUnits.some((u) => u.key === "u-advertising"));
  assert.ok(sciUnits.some((u) => u.key === "u-feelings-sc"));
  assert.ok(!sciUnits.some((u) => u.key === "u-ancient"), "Ancient Civilization should not appear for sciences");
});

test("curriculumCatalog includes streams on units that have them", () => {
  const c = curriculumCatalog();
  const as2 = c.secondary.find((g) => g.grade === "2as")!;
  const signsUnit = as2.units.find((u) => u.key === "u-signs")!;
  assert.deepEqual(signsUnit.streams, ["Lettres et Philosophie", "Lettres et Langues Étrangères"]);
  const peaceUnit = as2.units.find((u) => u.key === "u-peace")!;
  assert.equal(peaceUnit.streams, undefined, "shared units have no streams field");
});

test("resolveRules throws for invalid stream+unit combination", () => {
  assert.throws(
    () => resolveRules({ ...base, grade: "2as", stream: "Sciences Expérimentales", unit: "u-signs" }),
    /not part of/
  );
});

test("resolveRules resolves correct unit for 2AS scientific stream", () => {
  const r = resolveRules({
    level: "secondary",
    grade: "2as",
    stream: "Sciences Expérimentales",
    length: 150,
    unit: "u-peace",
    topic: "Resolving conflicts",
  });
  assert.equal(r.themeKey, "community");
  assert.equal(r.unitLabel, "Make Peace");
});

test("1AS units have no streams field (all streams)", () => {
  const c = curriculumCatalog();
  const as1 = c.secondary.find((g) => g.grade === "1as")!;
  for (const u of as1.units) {
    assert.equal(u.streams, undefined, `unit ${u.key} should have no streams`);
  }
  assert.equal(as1.units.length, 5);
});

test("getGuide('4am').structure === 'bem' and marks are 7/7/6", () => {
  const g = getGuide("4am");
  assert.equal(g.structure, "bem");
  assert.equal(g.marks.partOne, 7);
  assert.equal(g.marks.textExploration, 7);
  assert.equal(g.marks.writing, 6);
  assert.equal(g.marks.partOne + g.marks.textExploration + g.marks.writing, 20);
});

test("getGuide('1as').structure === 'bac' and total is 20", () => {
  const g = getGuide("1as");
  assert.equal(g.structure, "bac");
  assert.equal(g.marks.partOne + g.marks.textExploration + g.marks.writing, 20);
});

test("all middle grades have structure 'bem' and singleTopic writing", () => {
  for (const grade of ["1am", "2am", "3am", "4am"]) {
    const g = getGuide(grade);
    assert.equal(g.structure, "bem", `${grade} should be bem`);
    assert.equal(g.writing.singleTopic, true, `${grade} writing should be singleTopic`);
    assert.equal(g.textExploration.heading, "B. Mastery of Language", `${grade} textExploration heading`);
  }
});

test("all secondary grades have structure 'bac' and no singleTopic", () => {
  for (const grade of ["1as", "2as", "3as"]) {
    const g = getGuide(grade);
    assert.equal(g.structure, "bac", `${grade} should be bac`);
    assert.notEqual(g.writing.singleTopic, true, `${grade} writing should not be singleTopic`);
  }
});
