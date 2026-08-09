"use client";

import * as React from "react";
import { RefreshCw, Info, Eye, EyeOff, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { getGuide } from "@/data/guides";
import { formatMarks } from "@/lib/utils";
import type { ExamDto, SectionDto, TaskDto } from "@/types";
import { ReplacementModal, type AltItem } from "./replacement-modal";

const SKILL_LABELS: Record<string, string> = {
  READING: "Reading",
  VOCABULARY: "Vocabulary",
  MORPHOLOGY: "Morphology",
  PHONOLOGY: "Phonology",
  GRAMMAR: "Grammar",
  DISCOURSE: "Discourse",
};

export function TasksStage({
  kind,
  exam,
  section,
  generating,
  onGenerate,
  onEdit,
  onReplace,
  onMoreAlternatives,
  onSaveFavourite,
  onApplied,
}: {
  kind: "PART_ONE" | "TEXT_EXPLORATION";
  exam: ExamDto;
  section?: SectionDto;
  generating: boolean;
  onGenerate: () => void;
  onEdit: (patch: any) => void;
  onReplace: (taskId: string, index: number) => void;
  onMoreAlternatives: (taskId: string) => void;
  onSaveFavourite: (taskId: string) => void;
  onApplied: () => void;
}) {
  const { t } = useI18n();
  const guide = exam.config ? getGuide(exam.config.grade) : null;
  const [answers, setAnswers] = React.useState(false);
  const [replacing, setReplacing] = React.useState<TaskDto | null>(null);
  const [moreBusy, setMoreBusy] = React.useState(false);

  const tasks = section?.tasks ?? [];
  const total = tasks.reduce((s, x) => s + x.marks, 0);

  const heading =
    kind === "PART_ONE"
      ? { title: "A. Reading Comprehension", marks: guide ? `${formatMarks(guide.marks.partOne)} pts` : "" }
      : { title: "B. Text exploration", marks: guide ? `${formatMarks(guide.marks.textExploration)} pts` : "08 pts" };

  const emptyLabel =
    kind === "PART_ONE" ? t("builder.generatePartOne") : t("builder.generatePartTwo");

  async function moreAlternatives() {
    if (!replacing) return;
    setMoreBusy(true);
    try {
      await onMoreAlternatives(replacing.id);
    } finally {
      setMoreBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{heading.title}</h2>
        <p className="mt-1 text-sm font-semibold text-emerald-700">{heading.marks}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        {kind === "PART_ONE" ? t("builder.partOneHelp") : t("builder.partTwoHelp")}
      </p>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          {generating ? (
            <div className="mx-auto max-w-md space-y-3 px-6">
              <Skeleton className="mx-auto h-4 w-64" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {kind === "PART_ONE" ? t("builder.emptyText") : "Generate the language tasks for the text exploration section."}
              </p>
              <Button onClick={onGenerate} className="mt-4" size="lg">
                <Sparkles className="h-4 w-4" />
                {emptyLabel}
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Badge variant="secondary" className="text-xs">
              {t("builder.marksTotal")}: {formatMarks(total)} {t("builder.marks")}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setAnswers(!answers)}>
              {answers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {t("builder.answerKey")}
            </Button>
          </div>

          <div className="space-y-4">
            {tasks.map((task, i) => (
              <div key={task.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      Task {i + 1}
                    </span>
                    {task.skill && SKILL_LABELS[task.skill] && (
                      <Badge variant="outline">{SKILL_LABELS[task.skill]}</Badge>
                    )}
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatMarks(task.marks)} {t("builder.marks")}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => onSaveFavourite(task.id)} title="Save as favourite">
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setReplacing(task)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("builder.change")}
                  </Button>
                </div>

                {task.instruction && <p className="mt-3 text-xs font-medium text-muted-foreground">{task.instruction}</p>}
                <Textarea
                  value={task.prompt}
                  onChange={(e) => onEdit({ sections: [{ id: section!.id, tasks: [{ id: task.id, prompt: e.target.value }] }] })}
                  className="mt-2 min-h-[90px] text-sm"
                />

                {answers && task.answer && (
                  <div className="mt-3 rounded-lg bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-800">{t("builder.answers")}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-emerald-900">{task.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {kind === "PART_ONE" && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Tasks are generated from the text above. Replacing one task never touches the others.
            </p>
          )}
        </>
      )}

      {replacing && (
        <ReplacementModal
          open
          onClose={() => setReplacing(null)}
          title={`${t("builder.alternatives")} — Task ${tasks.findIndex((x) => x.id === replacing.id) + 1}`}
          items={(replacing.candidates ?? []).map((c: any, i: number): AltItem => ({
            key: `${replacing.id}-alt-${i}`,
            prompt: c.prompt ?? "",
            marks: c.marks ?? replacing.marks,
          }))}
          onSelect={(index) => {
            onReplace(replacing.id, index);
            setReplacing(null);
          }}
          onMore={moreAlternatives}
          busy={moreBusy}
          examId={exam.id}
          taskId={replacing.id}
          onApplied={() => {
            onApplied();
            setReplacing(null);
          }}
        />
      )}
    </div>
  );
}
