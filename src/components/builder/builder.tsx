"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { useI18n, type I18nKey } from "@/lib/i18n";
import type { ExamDto, SectionDto } from "@/types";
import { ParametersStage } from "./parameters-stage";
import { TextStage } from "./text-stage";
import { TasksStage } from "./tasks-stage";
import { WritingStage } from "./writing-stage";
import { PreviewStage } from "./preview-stage";
import { VersionsButton, VersionsModal } from "./versions-modal";

export type Stage = "params" | "text" | "partOne" | "partTwo" | "writing" | "preview";

const STEPS: { key: Stage; labelKey: I18nKey }[] = [
  { key: "params", labelKey: "builder.parameters" },
  { key: "text", labelKey: "builder.text" },
  { key: "partOne", labelKey: "builder.partOne" },
  { key: "partTwo", labelKey: "builder.partTwo" },
  { key: "writing", labelKey: "builder.writing" },
  { key: "preview", labelKey: "builder.preview" },
];

export function Builder({ initialExam }: { initialExam: ExamDto }) {
  const { t } = useI18n();
  const [exam, setExam] = React.useState<ExamDto>(initialExam);
  const [stage, setStage] = React.useState<Stage>(() => initialStage(initialExam));
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const section = (type: string): SectionDto | undefined => exam.sections.find((s) => s.type === type);
  const textSec = section("TEXT");
  const p1Sec = section("PART_ONE");
  const p2Sec = section("TEXT_EXPLORATION");
  const wSec = section("WRITING");

  const hasConfig = !!exam.config;
  const hasText = !!textSec?.text;
  const hasPartOne = (p1Sec?.tasks?.length ?? 0) > 0;
  const hasPartTwo = (p2Sec?.tasks?.length ?? 0) > 0;
  const hasWriting = (wSec?.topics?.length ?? 0) >= 2;

  const unlocked: Record<Stage, boolean> = {
    params: true,
    text: hasConfig,
    partOne: hasText,
    partTwo: hasPartOne,
    writing: hasPartTwo,
    preview: hasWriting,
  };

  const stageIndex = STEPS.findIndex((s) => s.key === stage);

  async function savePatch(patch: any, silent = false) {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data?.id) setExam(data);
      setSaveState("saved");
      if (!silent) toast("Saved", "success");
    } catch (e: any) {
      setSaveState("idle");
      toast(e?.message ?? "Could not save.", "error");
    }
  }

  function scheduleSave(patch: any) {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePatch(patch, true), 700);
  }

  async function generate(type: "TEXT" | "PART_ONE" | "TEXT_EXPLORATION" | "WRITING" | "TASK_ALT" | "TOPIC_ALT", extra?: { taskId?: string; topicId?: string }) {
    if (generating) return;
    setGenerating(type);
    try {
      const res = await fetch(`/api/exams/${exam.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Generation failed.", "error");
        return;
      }
      setExam(data);
      toast("Generated", "success");
      // Advance the workflow (PRD 5.1)
      if (type === "TEXT") setStage("text");
      if (type === "PART_ONE") setStage("partOne");
      if (type === "TEXT_EXPLORATION") setStage("writing");
    } finally {
      setGenerating(null);
    }
  }

  async function replaceItem(kind: "TEXT" | "TASK" | "TOPIC", id: string, index: number) {
    try {
      const res = await fetch(`/api/exams/${exam.id}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(kind === "TASK" ? { taskId: id } : kind === "TOPIC" ? { topicId: id } : {}), index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExam(data);
      toast("Replaced", "success");
    } catch (e: any) {
      toast(e?.message ?? "Could not replace.", "error");
    }
  }

  async function refreshExam() {
    try {
      const res = await fetch(`/api/exams/${exam.id}`);
      const data = await res.json();
      if (res.ok) setExam(data);
    } catch {
      /* keep current state */
    }
  }

  async function saveFavourite(taskId: string) {
    try {
      const res = await fetch(`/api/exams/${exam.id}/favourites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Saved to favourites", "success");
    } catch (e: any) {
      toast(e?.message ?? "Could not save favourite.", "error");
    }
  }

  async function rewrite(target: "simpler" | "harder") {
    if (generating) return;
    setGenerating("REWRITE");
    try {
      const res = await fetch(`/api/exams/${exam.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "REWRITE", target }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Rewrite failed.", "error");
        return;
      }
      setExam(data);
      toast(
        target === "simpler" ? "Simpler versions added to alternatives" : "Harder versions added to alternatives",
        "success"
      );
    } finally {
      setGenerating(null);
    }
  }

  async function submitParameters(config: {
    level: string;
    grade: string;
    stream?: string | null;
    length: number;
    unit: string;
    topic: string;
    customTopic: boolean;
  }) {
    try {
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExam(data);
      await generate("TEXT");
    } catch (e: any) {
      toast(e?.message ?? "Could not save parameters.", "error");
    }
  }

  const primaryCta: Record<Stage, { label: string; action: () => void; disabled?: boolean } | null> = {
    params: null,
    text: {
      label: t("builder.generatePartOne"),
      action: () => generate("PART_ONE"),
      disabled: !hasText,
    },
    partOne: {
      label: t("builder.generatePartTwo"),
      action: () => generate("TEXT_EXPLORATION"),
      disabled: !hasPartOne,
    },
    partTwo: {
      label: t("builder.generateWriting"),
      action: () => generate("WRITING"),
      disabled: !hasPartTwo,
    },
    writing: { label: t("builder.previewBtn"), action: () => setStage("preview"), disabled: !hasWriting },
    preview: null,
  };

  const cta = primaryCta[stage];

  return (
    <div className="space-y-6">
      {/* Builder top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            ← {t("nav.dashboard")}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="max-w-[220px] truncate font-medium sm:max-w-xs">{exam.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <VersionsButton onClick={() => setVersionsOpen(true)} />
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-1">
              <Save className="h-3 w-3 animate-pulse" /> {t("builder.saving")}
            </span>
          )}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="h-3 w-3" /> {t("builder.saved")}
            </span>
          )}
        </div>
      </div>

      {/* Stepper */}
      <nav className="no-print flex gap-1 overflow-x-auto rounded-xl border bg-white p-1.5" aria-label="Exam steps">
        {STEPS.map((s, i) => {
          const active = s.key === stage;
          const isUnlocked = unlocked[s.key];
          return (
            <button
              key={s.key}
              onClick={() => isUnlocked && setStage(s.key)}
              disabled={!isUnlocked}
              className={cn(
                "flex min-w-[92px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground shadow" : isUnlocked ? "text-foreground hover:bg-accent" : "cursor-not-allowed text-muted-foreground/50"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  active ? "bg-white/20" : isUnlocked ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              {t(s.labelKey)}
            </button>
          );
        })}
      </nav>

      {/* Stage content */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-8">
        {stage === "params" && (
          <ParametersStage exam={exam} onSubmit={submitParameters} />
        )}
        {stage === "text" && (
          <TextStage
            exam={exam}
            section={textSec}
            generating={generating === "TEXT"}
            onEdit={(patch) => {
              scheduleSave(patch);
              setExam((prev) => applySectionPatch(prev, patch));
            }}
            onGenerate={() => generate("TEXT")}
            onRewrite={rewrite}
            onReplace={(index) => replaceItem("TEXT", textSec!.id, index)}
          />
        )}
        {stage === "partOne" && (
          <TasksStage
            kind="PART_ONE"
            exam={exam}
            section={p1Sec}
            generating={generating === "PART_ONE"}
            onGenerate={() => generate("PART_ONE")}
            onEdit={(patch) => {
              scheduleSave(patch);
              setExam((prev) => applySectionPatch(prev, patch));
            }}
            onReplace={(taskId, index) => replaceItem("TASK", taskId, index)}
            onMoreAlternatives={(taskId) => generate("TASK_ALT", { taskId })}
            onSaveFavourite={saveFavourite}
            onApplied={refreshExam}
          />
        )}
        {stage === "partTwo" && (
          <TasksStage
            kind="TEXT_EXPLORATION"
            exam={exam}
            section={p2Sec}
            generating={generating === "TEXT_EXPLORATION"}
            onGenerate={() => generate("TEXT_EXPLORATION")}
            onEdit={(patch) => {
              scheduleSave(patch);
              setExam((prev) => applySectionPatch(prev, patch));
            }}
            onReplace={(taskId, index) => replaceItem("TASK", taskId, index)}
            onMoreAlternatives={(taskId) => generate("TASK_ALT", { taskId })}
            onSaveFavourite={saveFavourite}
            onApplied={refreshExam}
          />
        )}
        {stage === "writing" && (
          <WritingStage
            exam={exam}
            section={wSec}
            generating={generating === "WRITING"}
            onGenerate={() => generate("WRITING")}
            onEdit={(patch) => {
              scheduleSave(patch);
              setExam((prev) => applySectionPatch(prev, patch));
            }}
            onReplace={(topicId, index) => replaceItem("TOPIC", topicId, index)}
            onMoreAlternatives={(topicId) => generate("TOPIC_ALT", { topicId })}
          />
        )}
        {stage === "preview" && <PreviewStage exam={exam} />}
      </div>

      {/* Bottom navigation */}
      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        examId={exam.id}
        onRestored={refreshExam}
      />
      <div className="no-print flex items-center justify-between gap-3">
        <button
          onClick={() => stageIndex > 0 && setStage(STEPS[stageIndex - 1].key)}
          disabled={stageIndex === 0}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> {t("builder.back")}
        </button>
        {cta ? (
          <button
            onClick={cta.action}
            disabled={cta.disabled || !!generating}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-40"
          >
            {generating ? t("common.generating") : cta.label}
          </button>
        ) : stageIndex < STEPS.length - 1 ? (
          <button
            onClick={() => setStage(STEPS[stageIndex + 1].key)}
            disabled={!unlocked[STEPS[stageIndex + 1].key]}
            className="inline-flex items-center gap-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
          >
            {t("builder.next")} <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function initialStage(exam: ExamDto): Stage {
  const section = (type: string) => exam.sections.find((s) => s.type === type);
  if (!exam.config) return "params";
  if (!section("TEXT")?.text) return "text";
  if ((section("PART_ONE")?.tasks?.length ?? 0) === 0) return "partOne";
  if ((section("TEXT_EXPLORATION")?.tasks?.length ?? 0) === 0) return "partTwo";
  if ((section("WRITING")?.topics?.length ?? 0) < 2) return "writing";
  return "preview";
}

// Apply a section patch to local DTO state (mirrors the API patch contract).
function applySectionPatch(exam: ExamDto, patch: any): ExamDto {
  const next = structuredClone(exam);
  for (const sec of patch.sections ?? []) {
    const target = next.sections.find((s) => s.id === sec.id);
    if (!target) continue;
    if (typeof sec.text === "string") target.text = sec.text;
    if (typeof sec.textTitle === "string") target.textTitle = sec.textTitle;
    for (const t of sec.tasks ?? []) {
      const task = target.tasks.find((x) => x.id === t.id);
      if (!task) continue;
      if (typeof t.prompt === "string") task.prompt = t.prompt;
      if (typeof t.instruction === "string") task.instruction = t.instruction;
      if (typeof t.answer === "string") task.answer = t.answer;
    }
    for (const t of sec.topics ?? []) {
      const topic = target.topics.find((x) => x.id === t.id);
      if (!topic) continue;
      if (typeof t.situation === "string") topic.situation = t.situation;
      if (typeof t.instruction === "string") topic.instruction = t.instruction;
      if (typeof t.keywords === "string") topic.keywords = t.keywords;
      if (typeof t.title === "string") topic.title = t.title;
    }
  }
  return next;
}
