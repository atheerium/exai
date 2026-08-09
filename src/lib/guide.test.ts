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
  // Adding a French guide's data (without code changes to the catalog or UI)
  // must automatically surface "fr" as an available language.
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
  // Without a French guide, fr falls back to the English guide.
  assert.equal(getGuide("3as", "fr").language, "en");
  // Simulate adding a French guide's data: resolution must prefer it for fr
  // while en keeps the default — the seam is complete end-to-end.
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
