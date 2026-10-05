import { NextResponse } from "next/server";
import { curriculumCatalog } from "@/lib/guide";
import { GUIDES, getAvailableLanguages } from "@/data/guides";

export async function GET() {
  return NextResponse.json({
    languages: getAvailableLanguages(),
    levels: Object.fromEntries(
      Object.entries(curriculumCatalog()).filter(([k]) => k === "secondary")
    ),
    guides: Object.values(GUIDES).map((g) => ({
      key: g.key,
      name: g.name,
      language: g.language,
      version: g.version,
      sourceRef: g.sourceRef,
      marks: g.marks,
    })),
  });
}
