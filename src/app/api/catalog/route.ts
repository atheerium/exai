import { NextResponse } from "next/server";
import { curriculumCatalog } from "@/lib/guide";
import { GUIDES } from "@/data/guides";

export async function GET() {
  return NextResponse.json({
    levels: curriculumCatalog(),
    guides: Object.values(GUIDES).map((g) => ({
      key: g.key,
      name: g.name,
      version: g.version,
      sourceRef: g.sourceRef,
      marks: g.marks,
    })),
  });
}
