"use client";

import * as React from "react";
import { Download, FileText, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { assembleDocument, type ExportDocument } from "@/lib/export/assemble";
import { buildPaper } from "@/lib/export/paper";
import type { ExamDto } from "@/types";

export function PreviewStage({ exam }: { exam: ExamDto }) {
  const { t } = useI18n();
  const doc = React.useMemo(() => assembleDocument(exam), [exam]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t("builder.preview")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("builder.previewHelp")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/exams/${exam.id}/export?format=pdf`} download>
            <Button>
              <FileDown className="h-4 w-4" />
              {t("builder.exportPdf")}
            </Button>
          </a>
          <a href={`/api/exams/${exam.id}/export?format=docx`} download>
            <Button variant="outline">
              <FileText className="h-4 w-4" />
              {t("builder.exportDocx")}
            </Button>
          </a>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <ExamDocument doc={doc} />
    </div>
  );
}
function ExamDocument({ doc }: { doc: ExportDocument }) {
  const paper = React.useMemo(() => buildPaper(doc), [doc]);

  return (
    <div className="print-block mx-auto max-w-3xl rounded-xl border bg-card p-8 shadow-sm sm:p-12">
      {paper.blocks.map((block, bi) => {
        switch (block.kind) {
          case "masthead":
            return (
              <header key={bi} className="border-b pb-4 text-center">
                <h1 className="text-lg font-bold tracking-tight">{block.title}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{block.subtitle}</p>
                {block.meta.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">{block.meta.join("   ·   ")}</p>
                )}
              </header>
            );

          case "sectionHead":
            return (
              <div key={bi} className="mt-8 flex items-baseline justify-between gap-4 first:mt-0">
                <h2 className="font-bold text-foreground">{block.heading}</h2>
                <span className="shrink-0 text-sm font-bold text-foreground">{block.marks}</span>
              </div>
            );

          case "instruction":
            return (
              <p key={bi} className="mt-2 text-[15px] font-bold italic">
                {block.text}
              </p>
            );

          case "passage":
            return (
              <div key={bi} className="mt-4">
                {block.title && <h3 className="mb-2 text-center text-base font-semibold">{block.title}</h3>}
                {block.paragraphs.map((paragraph, pi) => (
                  <p key={pi} className="mt-2 text-justify text-[15px] leading-relaxed">
                    <Underlined text={paragraph} emphasis={block.emphasis} />
                  </p>
                ))}
              </div>
            );

          case "sourceNote":
            return (
              <p key={bi} className="mt-3 text-right text-sm font-bold italic">
                {block.text}
              </p>
            );

          case "task":
            return (
              <div key={bi} className="mt-5">
                <p className="text-[15px] font-bold italic">
                  <span className="not-italic">{block.task.number}.</span> {block.task.instruction}
                </p>
                {block.task.lead.map((line, li) => (
                  <p key={li} className="mt-1 pl-8 text-[15px] leading-relaxed">
                    {line}
                  </p>
                ))}
                {block.task.items.map((item) => (
                  <p key={item.label} className="mt-1 flex gap-2 pl-8 text-[15px] leading-relaxed">
                    <span className="w-4 shrink-0 font-semibold">{item.label}</span>
                    <span className="flex-1">
                      {item.text}
                      {item.gap && (
                        <span className="whitespace-nowrap">{" . . . . . . . . . . . . . . . . . ."}</span>
                      )}
                    </span>
                  </p>
                ))}
              </div>
            );

          case "table":
            return (
              <div key={bi} className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse border border-foreground text-sm">
                  <thead>
                    <tr>
                      {block.table.headers.map((h, hi) => (
                        <th key={hi} className="border border-foreground px-3 py-2 text-left font-semibold text-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.table.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border border-foreground px-3 py-2 align-top">
                            {cell || "\u00a0"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "topic":
            return (
              <div key={bi} className="mt-6">
                <p className="text-[15px] font-bold">{block.topic.label}</p>
                {block.topic.lines.map((line, li) => (
                  <p key={li} className="mt-1 pl-8 text-[15px] leading-relaxed">
                    {line}
                  </p>
                ))}
                {block.topic.noteHeading && (
                  <>
                    <p className="mt-2 pl-8 text-[15px] font-semibold">{block.topic.noteHeading}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-14 text-[15px] leading-relaxed">
                      {block.topic.notes.map((note, ni) => (
                        <li key={ni}>{note}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );

          case "colophon":
            return (
              <footer key={bi} className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
                {block.text}
              </footer>
            );
        }
      })}
    </div>
  );
}

function Underlined({ text, emphasis }: { text: string; emphasis: string[] }) {
  const targets = emphasis.filter((w) => w.length > 1);
  if (targets.length === 0) return <>{text}</>;

  const pattern = new RegExp(
    "\\b(" + targets.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
    "gi"
  );
  const parts: { text: string; mark: boolean }[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > cursor) parts.push({ text: text.slice(cursor, m.index), mark: false });
    parts.push({ text: m[0], mark: true });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), mark: false });

  return (
    <>
      {parts.map((part, i) =>
        part.mark ? (
          <u key={i} className="font-bold decoration-1 underline-offset-2">
            {part.text}
          </u>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}
