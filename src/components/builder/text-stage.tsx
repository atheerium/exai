"use client";

import * as React from "react";
import { RefreshCw, ChevronLeft, ChevronRight, Check, Info, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  onRewrite,
  onReplace,
  onUndo,
}: {
  exam: ExamDto;
  section?: SectionDto;
  generating: boolean;
  onEdit: (patch: any) => void;
  onGenerate: () => void;
  onRewrite: (target: "simpler" | "harder") => void;
  onReplace: (index: number) => void;
  onUndo?: () => void;
}) {
  const { t } = useI18n();
  const guide = exam.config ? getGuide(exam.config.grade, exam.config.language ?? "en", exam.config.stream ?? undefined) : null;
  const [alt, setAlt] = React.useState(-1);
  const candidates = section?.candidates ?? [];
  const sources = exam.sources ?? [];
  const selectedSourceIndex = section?.sourceIndex ?? 0;
  const source = sources[selectedSourceIndex] ?? sources[0];
  const previousText = section?.previousText ?? undefined;

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
          <h2 className="text-xl font-extrabold tracking-tight">A. Reading Comprehension</h2>
          {guide && (
            <Badge variant="success" className="mt-1.5">
              {formatMarks(guide.marks.partOne)} pts
            </Badge>
          )}
        </div>
        {source?.adaptationNote && (
          <p className="max-w-xs text-right text-xs text-muted-foreground">{source.adaptationNote}</p>
        )}
      </div>

      {sources.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">{t("builder.source")}</label>
          <Select
            value={selectedSourceIndex}
            onChange={(e) =>
              onEdit({ sections: [{ id: section!.id, sourceIndex: Number(e.target.value) }] })
            }
            className="w-auto min-w-[14rem]"
          >
            {sources.map((s, i) => (
              <option key={i} value={i}>
                {s.title}
                {s.author ? ` · ${s.author}` : ""}
              </option>
            ))}
          </Select>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{t("builder.textStageHelp")}</p>

      {!section?.text ? (
        <div className="rounded border-2 border-dashed border-foreground bg-card py-16 text-center">
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
            {/* The official paper prints no passage title (user rule
                2026-10-11). The title stays editable so the teacher can turn the
                toggle on instead of regenerating. */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={section.showTitle === true}
                onChange={(e) => onEdit({ sections: [{ id: section.id, showTitle: e.target.checked }] })}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {t("builder.showPassageTitle")}
            </label>
            <Textarea
              value={section.text ?? ""}
              onChange={(e) => onEdit({ sections: [{ id: section.id, text: e.target.value }] })}
              className="min-h-[280px] max-h-[420px] overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed"
              spellCheck
            />
            <p className="text-right text-xs text-muted-foreground">
              {(section.text ?? "").trim().split(/\s+/).filter(Boolean).length} {t("builder.words")}
            </p>
          </div>

          {/* Alternatives */}
          {candidates.length > 0 && (
            <div className="rounded border-2 border-foreground bg-secondary p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{t("builder.alternatives")}</span>
                  <span className="text-xs text-muted-foreground">
                    {alt >= 0 ? `${alt + 1} / ${candidates.length}` : `${candidates.length} ${t("builder.alternativesAvailable")}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAlt((a) => Math.max(0, a - 1))}
                    disabled={alt <= 0}
                    aria-label={t("builder.prevAlternative")}
                    title={t("builder.prevAlternative")}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAlt((a) => Math.min(candidates.length - 1, a + 1))}
                    disabled={alt >= candidates.length - 1}
                    aria-label={t("builder.nextAlternative")}
                    title={t("builder.nextAlternative")}
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
                <div className="mt-3 min-h-[280px] max-h-[420px] overflow-y-auto rounded border-2 border-foreground bg-card p-4 shadow-sm">
                  <p className="text-sm font-semibold">{candidates[alt].title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{candidates[alt].text}</p>
                  <p className="mt-2 text-right text-xs text-muted-foreground">
                    {candidates[alt].text.trim().split(/\s+/).filter(Boolean).length} {t("builder.words")}
                  </p>
                </div>
              )}
              {alt < 0 && (
                <div className="mt-3 rounded border-2 border-dashed border-foreground bg-card px-4 py-6 text-center">
                  <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
                    {t("builder.alternativesHint")}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onGenerate} disabled={generating}>
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {t("builder.regenerate")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRewrite("simpler")}
              disabled={!!generating}
              title="Rewrite the passage in simpler English"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Simplify
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRewrite("harder")}
              disabled={!!generating}
              title="Rewrite the passage at a harder level"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Make harder
            </Button>
            {previousText && onUndo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onUndo}
                title="Restore the previous version"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </Button>
            )}
            {generating && <span className="text-sm text-muted-foreground">{t("common.generating")}</span>}
          </div>
        </>
      )}
    </div>
  );
}
