"use client";

import * as React from "react";
import { RefreshCw, ChevronLeft, ChevronRight, Check, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { getGuide } from "@/data/guides";
import { formatMarks } from "@/lib/utils";
import type { ExamDto, SectionDto } from "@/types";

export function TextStage({
  exam,
  section,
  generating,
  onEdit,
  onGenerate,
  onReplace,
}: {
  exam: ExamDto;
  section?: SectionDto;
  generating: boolean;
  onEdit: (patch: any) => void;
  onGenerate: () => void;
  onReplace: (index: number) => void;
}) {
  const { t } = useI18n();
  const guide = exam.config ? getGuide(exam.config.grade) : null;
  const [alt, setAlt] = React.useState(-1);
  const candidates = section?.candidates ?? [];
  const source = exam.sources[0];

  if (!exam.config) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Info className="mx-auto h-8 w-8" />
        <p className="mt-3">{t("builder.noConfig")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">A. Reading Comprehension</h2>
          <p className="mt-1 text-sm font-semibold text-emerald-700">
            {guide ? `${formatMarks(guide.marks.partOne)} pts` : ""}
          </p>
        </div>
        {source?.adaptationNote && (
          <p className="max-w-xs text-right text-xs text-muted-foreground">{source.adaptationNote}</p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t("builder.textStageHelp")}</p>

      {!section?.text ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          {generating ? (
            <div className="mx-auto max-w-md space-y-3 px-6">
              <Skeleton className="mx-auto h-5 w-48" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("builder.emptyText")}</p>
              <Button onClick={onGenerate} className="mt-4" size="lg">
                <Sparkles className="h-4 w-4" />
                {t("builder.generateText")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <Input
              value={section.textTitle ?? ""}
              placeholder="Text title"
              onChange={(e) => onEdit({ sections: [{ id: section.id, textTitle: e.target.value }] })}
              className="font-semibold"
            />
            <Textarea
              value={section.text ?? ""}
              onChange={(e) => onEdit({ sections: [{ id: section.id, text: e.target.value }] })}
              className="min-h-[280px] text-[15px] leading-relaxed"
              spellCheck
            />
            <p className="text-right text-xs text-muted-foreground">
              {(section.text ?? "").trim().split(/\s+/).filter(Boolean).length} {t("builder.words")}
            </p>
          </div>

          {/* Alternatives */}
          {candidates.length > 0 && (
            <div className="rounded-xl border bg-secondary/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{t("builder.alternatives")}</span>
                  <span className="text-xs text-muted-foreground">
                    {alt >= 0 ? `${alt + 1} / ${candidates.length}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAlt((a) => Math.max(0, a - 1))} disabled={alt <= 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAlt((a) => Math.min(candidates.length - 1, a + 1))}
                    disabled={alt >= candidates.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {alt >= 0 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onReplace(alt);
                        setAlt(-1);
                        toast("Alternative selected", "success");
                      }}
                    >
                      <Check className="h-4 w-4" />
                      {t("builder.select")}
                    </Button>
                  )}
                </div>
              </div>
              {alt >= 0 && (
                <div className="mt-3 rounded-lg border bg-white p-4">
                  <p className="text-sm font-semibold">{candidates[alt].title}</p>
                  <p className="mt-1 line-clamp-5 text-sm text-muted-foreground">{candidates[alt].text}</p>
                </div>
              )}
              {alt < 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Browse candidate texts with the arrows. Your current text is always kept until you select one.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={onGenerate} disabled={generating}>
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {t("builder.regenerate")}
            </Button>
            {generating && <span className="text-sm text-muted-foreground">{t("common.generating")}</span>}
          </div>
        </>
      )}
    </div>
  );
}
