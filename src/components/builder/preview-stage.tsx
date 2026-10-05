"use client";

import * as React from "react";
import { Download, FileText, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { assembleDocument, type ExportDocument } from "@/lib/export/assemble";
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
  const isBac = doc.structure === "bac";
  return (
    <div className="print-block mx-auto max-w-3xl rounded-xl border bg-card p-8 shadow-sm sm:p-12">
      <header className="border-b pb-4 text-center">
        <h1 className="text-lg font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{doc.subtitle}</p>
        <p className="mt-2 text-xs text-muted-foreground">{doc.meta.join("   ·   ")}</p>
      </header>

      <div className="mt-6 space-y-8">
        {doc.sections.map((section) => {
          // Show section if it has content OR if it has a heading and marksLabel (for BAC umbrella sections)
          const hasContent = section.text?.body || section.tasks.length > 0 || section.topics.length > 0;
          const isHeadingOnly = !!section.heading && !!section.marksLabel;
          if (!hasContent && !isHeadingOnly) return null;
          return (
            <section key={section.heading}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-bold text-foreground">{section.heading}</h2>
                <span className="text-sm font-semibold text-emerald-700">{section.marksLabel}</span>
              </div>

              {section.text?.title && <h3 className="mt-3 font-semibold">{section.text.title}</h3>}
              {section.text?.body && (
                <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">{section.text.body}</p>
              )}
              {section.sourceNote && (
                <p className={`mt-2 text-right text-xs text-muted-foreground${isBac ? " italic" : ""}`}>{section.sourceNote}</p>
              )}

              {section.intro && <p className="mt-3 text-sm font-semibold">{section.intro}</p>}

              {section.tasks.length > 0 && (
                <div className="mt-5 space-y-5">
                  {section.tasks.map((task, i) => (
                    <div key={i}>
                      <p className="text-sm font-semibold">
                        {isBac ? (
                          `${i + 1}- ${task.instruction}`.trim()
                        ) : (
                          <>
                            Task {i + 1} <span className="font-normal text-muted-foreground">({task.marks} pts)</span>
                          </>
                        )}
                      </p>
                      {!isBac && task.instruction && <p className="mt-0.5 text-sm text-muted-foreground">{task.instruction}</p>}
                      <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed">{task.prompt}</p>
                      {task.table && task.table.headers.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full border-collapse border text-sm">
                            <thead>
                              <tr className="bg-muted">
                                {task.table.headers.map((h, hi) => (
                                  <th key={hi} className="border px-3 py-2 text-left font-semibold">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {task.table.rows.map((row, ri) => (
                                <tr key={ri} className={ri % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="border px-3 py-2">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {section.topics.length > 0 && (
                <div className="mt-5 space-y-5">
                  {section.topics.map((topic, i) => (
                    <div key={i}>
                      <p className="text-sm font-semibold">
                        {isBac ? `Topic ${["One", "Two", "Three", "Four", "Five"][i] ?? i + 1}:` : (
                          <>
                            {topic.title} <span className="font-normal text-muted-foreground">({topic.marks} pts)</span>
                          </>
                        )}
                      </p>
                      {topic.situation && <p className="mt-1 text-[15px] leading-relaxed">{topic.situation}</p>}
                      {topic.instruction && <p className="mt-1 text-[15px] leading-relaxed">{topic.instruction}</p>}
                      {topic.keywords &&
                        (isBac ? (
                          <>
                            <p className="mt-1 text-sm font-semibold">Make the best use of the following notes:</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[15px] leading-relaxed">
                              {topic.keywords
                                .split(/[,/;\n]+/)
                                .map((k) => k.trim().replace(/^[-–•\s]+/, ""))
                                .filter(Boolean)
                                .map((note, ni) => (
                                  <li key={ni}>{note}</li>
                                ))}
                            </ul>
                          </>
                        ) : (
                          <p className="mt-1 text-sm font-semibold">Key words: {topic.keywords}</p>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        )}
      </div>

      <footer className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
        {doc.generatedBy}
      </footer>
    </div>
  );
}