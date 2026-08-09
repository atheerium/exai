import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { assembleDocument } from "@/lib/export/assemble";
import { renderPdf } from "@/lib/export/pdf";
import { renderDocx } from "@/lib/export/docx";
import { track } from "@/lib/events";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const format = req.nextUrl.searchParams.get("format") || "pdf";
    if (format !== "pdf" && format !== "docx") {
      return NextResponse.json({ error: "Unsupported format." }, { status: 400 });
    }
    const dto = await loadExamDto(id, user.id);
    const docModel = assembleDocument(dto);
    const filename = `${slug(dto.title) || "exam"}.${format}`;

    if (format === "pdf") {
      const buffer = await renderPdf(docModel);
      await track("exam_exported_pdf", { userId: user.id, examId: id });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    const buffer = await renderDocx(docModel);
    await track("exam_exported_docx", { userId: user.id, examId: id });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("EXPORT_ERROR", e?.message);
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (e?.message === "NOT_FOUND") return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
