// Guide engine helpers: resolve the applicable guide/rules for an exam
// configuration (PRD sections 16.1, 19) and validate teacher parameters.

import { GRADES, GUIDES, getGrade, getGuide, type Guide } from "@/data/guides";
import { getTheme } from "@/data/themes";

export interface ResolvedExamRules {
  guide: Guide;
  themeKey: string;
  unitLabel: string;
  topic: string;
  level: string;
  grade: string;
  stream: string | null;
  length: number;
  language: string;
}

export function resolveRules(params: {
  level: string;
  grade: string;
  stream?: string | null;
  length?: number;
  unit: string;
  topic: string;
  language?: string;
}): ResolvedExamRules {
  const gradeDef = getGrade(params.grade);
  if (gradeDef.level !== params.level) {
    throw new Error(`Grade ${params.grade} does not belong to level ${params.level}`);
  }
  if (gradeDef.streams && params.stream && !gradeDef.streams.includes(params.stream)) {
    throw new Error(`Stream "${params.stream}" is not valid for grade ${params.grade}`);
  }
  const language = params.language && params.language !== "en" ? params.language : "en";
  const guide = getGuide(params.grade, language, params.stream ?? undefined);
  const unit = gradeDef.units.find(
    (u) => u.key === params.unit && (!u.streams || !params.stream || u.streams.includes(params.stream))
  ) ?? gradeDef.units.find(
    (u) => !u.streams || !params.stream || u.streams.includes(params.stream)
  ) ?? gradeDef.units[0];
  if (!unit) throw new Error("No unit found for this grade");
  if (params.unit && unit.key !== params.unit) {
    throw new Error(`Unit "${params.unit}" is not part of the ${params.stream ?? "all streams"} stream for grade ${params.grade}`);
  }
  const length = params.length ?? guide.defaultLength;
  if (!guide.lengthOptions.includes(length)) {
    throw new Error(`Length ${length} is not allowed by the guide for grade ${params.grade}`);
  }
  return {
    guide,
    themeKey: unit.theme,
    unitLabel: unit.label,
    topic: params.topic,
    level: params.level,
    grade: params.grade,
    stream: params.stream ?? null,
    length,
    language,
  };
}

export function validateConfigInputs(params: {
  level: string;
  grade: string;
  stream?: string | null;
  length?: number;
  unit: string;
  topic: string;
}) {
  if (!params.level || !params.grade || !params.unit || !params.topic) {
    throw new Error("Missing required parameters");
  }
  resolveRules(params);
  return true;
}

export function getThemeFor(params: { grade: string; unit: string; stream?: string }) {
  const gradeDef = getGrade(params.grade);
  const unit = gradeDef.units.find(
    (u) => u.key === params.unit && (!u.streams || !params.stream || u.streams.includes(params.stream))
  ) ?? gradeDef.units.find(
    (u) => !u.streams || !params.stream || u.streams.includes(params.stream)
  ) ?? gradeDef.units[0];
  return getTheme(unit.theme);
}

export function curriculumCatalog() {
  const levels = Object.keys(GRADES)
    .map((k) => GRADES[k])
    .reduce<Record<string, { grade: string; label: string; streams: string[] | null; units: { key: string; label: string; topics: string[]; streams?: string[] }[] }[]>>(
      (acc, g) => {
        (acc[g.level] ??= []).push({
          grade: g.grade,
          label: g.label,
          streams: g.streams,
          units: g.units.map((u) => ({ key: u.key, label: u.label, topics: u.topics, ...(u.streams ? { streams: u.streams } : {}) })),
        });
        return acc;
      },
      {}
    );
  return levels;
}

export { GUIDES };
