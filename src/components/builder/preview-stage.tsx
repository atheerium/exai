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
  return (
    <div className="print-block mx-auto max-w-3xl rounded-xl border bg-white p-8 shadow-sm sm:p-12">
      <header className="border-b pb-4 text-center">
        <h1 className="text-lg font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{doc.subtitle}</p>
        <p className="mt-2 text-xs text-muted-foreground">{doc.meta.join("   ·   ")}</p>
      </header>

      <div className="mt-6 space-y-8">
        {doc.sections.map((section) => {
          const empty = !section.text?.body && section.tasks.length === 0 && section.topics.length === 0;
          if (empty) return null;
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
                <p className="mt-2 text-right text-xs text-muted-foreground">{section.sourceNote}</p>
              )}

              {section.tasks.length > 0 && (
                <div className="mt-5 space-y-5">
                  {section.tasks.map((task, i) => (
                    <div key={i}>
                      <p className="text-sm font-semibold">
                        Task {i + 1} <span className="font-normal text-muted-foreground">({task.marks} pts)</span>
                      </p>
                      {task.instruction && <p className="mt-0.5 text-sm text-muted-foreground">{task.instruction}</p>}
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
                                <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-muted/30"}>
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
                        {topic.title} <span className="font-normal text-muted-foreground">({topic.marks} pts)</span>
                      </p>
                      {topic.situation && <p className="mt-1 text-[15px] leading-relaxed">{topic.situation}</p>}
                      {topic.instruction && <p className="mt-1 text-[15px] leading-relaxed">{topic.instruction}</p>}
                      {topic.keywords && (
                        <p className="mt-1 text-sm font-semibold">Key words: {topic.keywords}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
        {doc.generatedBy}
      </footer>
    </div>
  );
}
