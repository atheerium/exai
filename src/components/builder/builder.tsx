"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { useI18n, type I18nKey } from "@/lib/i18n";
import { getGuide } from "@/data/guides";
import type { ExamDto, SectionDto } from "@/types";
import { ParametersStage } from "./parameters-stage";
import { TextStage } from "./text-stage";
import { TasksStage } from "./tasks-stage";
import { WritingStage } from "./writing-stage";
import { PreviewStage } from "./preview-stage";
import { VersionsButton, VersionsModal } from "./versions-modal";

export type SectionId = "params" | "text" | "partOne" | "partTwo" | "writing" | "preview";

const SECTIONS: { key: SectionId; labelKey: I18nKey }[] = [
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
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<SectionId>("params");
  const [paramsCollapsed, setParamsCollapsed] = React.useState(!!exam.config);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const sectionRefs = React.useRef<Record<SectionId, HTMLElement | null>>({
    params: null,
    text: null,
    partOne: null,
    partTwo: null,
    writing: null,
    preview: null,
  });

  const section = (type: string): SectionDto | undefined => exam.sections.find((s) => s.type === type);
  const textSec = section("TEXT");
  const p1Sec = section("PART_ONE");
  const p2Sec = section("TEXT_EXPLORATION");
  const wSec = section("WRITING");

  const guide = exam.config ? getGuide(exam.config.grade, exam.config.language ?? "en", exam.config.stream ?? undefined) : null;
  const hasConfig = !!exam.config;
  const hasText = !!textSec?.text;
  const hasPartOne = (p1Sec?.tasks?.length ?? 0) > 0;
  const hasPartTwo = (p2Sec?.tasks?.length ?? 0) > 0;
  const hasWriting = (wSec?.topics?.length ?? 0) >= (guide?.writing.singleTopic ? 1 : 2);

  const unlocked: Record<SectionId, boolean> = {
    params: true,
    text: hasConfig,
    partOne: hasText,
    partTwo: hasPartOne,
    writing: hasPartTwo,
    preview: hasWriting,
  };

  // IntersectionObserver for active section tracking
  React.useEffect(() => {
    const entries = Object.entries(sectionRefs.current) as [SectionId, HTMLElement | null][];
    const validEntries = entries.filter(([, el]) => el !== null);

    const observer = new IntersectionObserver(
      (observerEntries) => {
        // Find the most visible section
        let maxRatio = 0;
        let visibleSection: SectionId = "params";
        for (const entry of observerEntries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const id = Object.keys(sectionRefs.current).find(
              (k) => sectionRefs.current[k as SectionId] === entry.target
            ) as SectionId | undefined;
            if (id) visibleSection = id;
          }
        }
        if (maxRatio > 0) setActiveSection(visibleSection);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-80px 0px -40% 0px" }
    );

    for (const [, el] of validEntries) {
      observer.observe(el!);
    }

    return () => observer.disconnect();
  }, []);

  function scrollToSection(id: SectionId) {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function savePatch(patch: Record<string, unknown>, silent = false) {
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
    } catch (e: unknown) {
      setSaveState("idle");
      toast(e instanceof Error ? e.message : "Could not save.", "error");
    }
  }

  function scheduleSave(patch: Record<string, unknown>) {
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
      if (type === "TEXT" && textSec?.text) {
        toast("New versions added to the alternatives box", "success");
      } else {
        toast("Generated", "success");
      }
      // Scroll to the relevant section after generation
      const scrollMap: Record<string, SectionId> = {
        TEXT: "text",
        PART_ONE: "partOne",
        TEXT_EXPLORATION: "partTwo",
        WRITING: "writing",
      };
      const target = scrollMap[type];
      if (target) {
        requestAnimationFrame(() => scrollToSection(target));
      }
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
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Could not replace.", "error");
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
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Could not save favourite.", "error");
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
      toast(target === "simpler" ? "Text simplified" : "Text made harder", "success");
    } finally {
      setGenerating(null);
    }
  }

  async function undoRewrite() {
    const textSec = exam.sections.find((s) => s.type === "TEXT");
    if (!textSec?.previousText) return;
    await savePatch({
      sections: [{
        id: textSec.id,
        text: textSec.previousText,
        textTitle: textSec.previousTitle ?? undefined,
        clearPrevious: true,
      }],
    });
    toast("Previous version restored", "success");
  }

  async function submitParameters(config: {
    level: string;
    grade: string;
    stream?: string | null;
    length: number;
    unit: string;
    topic: string;
    customTopic: boolean;
    teacherKeywords?: string | null;
    difficulty?: string | null;
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
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Could not save parameters.", "error");
    }
  }

  return (
    <div className="space-y-0">
      {/* Builder top bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            &larr; {t("nav.dashboard")}
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

      {/* Sticky section nav */}
      <nav
        className="no-print sticky top-0 z-40 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1.5 shadow-sm"
        aria-label="Exam sections"
      >
        {SECTIONS.map((s) => {
          const isActive = s.key === activeSection;
          const isUnlocked = unlocked[s.key];
          const isComplete =
            (s.key === "params" && hasConfig) ||
            (s.key === "text" && hasText) ||
            (s.key === "partOne" && hasPartOne) ||
            (s.key === "partTwo" && hasPartTwo) ||
            (s.key === "writing" && hasWriting) ||
            false;
          return (
            <button
              key={s.key}
              onClick={() => {
                if (isUnlocked) scrollToSection(s.key);
              }}
              disabled={!isUnlocked}
              aria-label={`${t(s.labelKey)}${isComplete ? " (complete)" : ""}`}
              className={cn(
                "flex min-w-[72px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                isActive ? "bg-primary text-primary-foreground shadow" : isUnlocked ? "text-foreground hover:bg-accent" : "cursor-not-allowed text-muted-foreground/50"
              )}
            >
              {isComplete ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                    isActive ? "bg-white/20" : isUnlocked ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {SECTIONS.indexOf(s) + 1}
                </span>
              )}
              <span className="truncate">{t(s.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {/* Sections */}
      <div className="space-y-6 pt-4">
        {/* Section: Parameters */}
        <section
          id="section-params"
          ref={(el) => { sectionRefs.current.params = el; }}
          className="scroll-mt-20 rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
        >
          <ParametersStage
            exam={exam}
            collapsed={paramsCollapsed && hasConfig}
            onToggleCollapse={() => setParamsCollapsed((c) => !c)}
            onSubmit={submitParameters}
          />
        </section>

        {/* Section: A. Reading Comprehension */}
        <section
          id="section-text"
          ref={(el) => { sectionRefs.current.text = el; }}
          className="scroll-mt-20 rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
        >
          {!unlocked.text ? (
            <EmptySection
              title="A. Reading Comprehension"
              label={t("builder.generateText")}
              prereq={!hasConfig}
              prereqMsg={t("builder.prereqMissing")}
              onGenerate={() => {
                scrollToSection("params");
              }}
            />
          ) : (
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
              onUndo={undoRewrite}
            />
          )}
        </section>

        {/* Section: Part One (reading comprehension tasks) */}
        <section
          id="section-partOne"
          ref={(el) => { sectionRefs.current.partOne = el; }}
          className="scroll-mt-20 rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
        >
          {!unlocked.partOne ? (
            <EmptySection
              title="A. Reading Comprehension"
              label={t("builder.generatePartOne")}
              prereq={!hasText}
              prereqMsg={t("builder.prereqMissing")}
              onGenerate={() => {
                if (hasText) generate("PART_ONE");
                else scrollToSection("text");
              }}
            />
          ) : (
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
        </section>

        {/* Section: B. Text Exploration */}
        <section
          id="section-partTwo"
          ref={(el) => { sectionRefs.current.partTwo = el; }}
          className="scroll-mt-20 rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
        >
          {!unlocked.partTwo ? (
            <EmptySection
              title={guide?.headings?.textExploration ?? "B. Text exploration"}
              label={t("builder.generatePartTwo")}
              prereq={!hasPartOne}
              prereqMsg={t("builder.prereqMissing")}
              onGenerate={() => {
                if (hasPartOne) generate("TEXT_EXPLORATION");
                else scrollToSection("partOne");
              }}
            />
          ) : (
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
        </section>

        {/* Section: C. Written Expression */}
        <section
          id="section-writing"
          ref={(el) => { sectionRefs.current.writing = el; }}
          className="scroll-mt-20 rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
        >
          {!unlocked.writing ? (
            <EmptySection
              title={guide?.headings?.writing ?? "C. Written expression"}
              label={t("builder.generateWriting")}
              prereq={!hasPartTwo}
              prereqMsg={t("builder.prereqMissing")}
              onGenerate={() => {
                if (hasPartTwo) generate("WRITING");
                else scrollToSection("partTwo");
              }}
            />
          ) : (
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
        </section>

        {/* Section: Preview & Export */}
        <section
          id="section-preview"
          ref={(el) => { sectionRefs.current.preview = el; }}
          className="scroll-mt-20 rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
        >
          {!unlocked.preview ? (
            <EmptySection
              title={t("builder.previewInline")}
              label={t("builder.previewInline")}
              prereq={!hasWriting}
              prereqMsg={t("builder.prereqMissing")}
              onGenerate={() => {
                if (hasWriting) scrollToSection("preview");
                else scrollToSection("writing");
              }}
            />
          ) : (
            <PreviewStage exam={exam} />
          )}
        </section>
      </div>

      {/* VersionsModal */}
      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        examId={exam.id}
        onRestored={refreshExam}
      />
    </div>
  );
}

/* Empty section placeholder shown when prerequisites aren't met */
function EmptySection({
  title,
  label,
  prereq,
  prereqMsg,
  onGenerate,
}: {
  title: string;
  label: string;
  prereq: boolean;
  prereqMsg: string;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
      <div className="rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {prereq ? prereqMsg : label}
        </p>
        {!prereq && (
          <button
            onClick={onGenerate}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            {label}
          </button>
        )}
      </div>
    </div>
  );
}

// Apply a section patch to local DTO state (mirrors the API patch contract).
function applySectionPatch(exam: ExamDto, patch: Record<string, unknown>): ExamDto {
  const next = structuredClone(exam);
  const patchSections = patch.sections as Array<Record<string, unknown>> | undefined;
  for (const sec of patchSections ?? []) {
    const target = next.sections.find((s) => s.id === sec.id);
    if (!target) continue;
    if (typeof sec.text === "string") target.text = sec.text;
    if (typeof sec.textTitle === "string") target.textTitle = sec.textTitle;
    if ("sourceIndex" in sec) {
      target.sourceIndex = sec.sourceIndex === null ? null : Number(sec.sourceIndex);
    }
    const patchTasks = sec.tasks as Array<Record<string, unknown>> | undefined;
    for (const t of patchTasks ?? []) {
      const task = target.tasks.find((x) => x.id === t.id);
      if (!task) continue;
      if (typeof t.prompt === "string") task.prompt = t.prompt;
      if (typeof t.instruction === "string") task.instruction = t.instruction;
      if (typeof t.answer === "string") task.answer = t.answer;
      if (typeof t.marks === "number") task.marks = t.marks;
    }
    const patchTopics = sec.topics as Array<Record<string, unknown>> | undefined;
    for (const t of patchTopics ?? []) {
      const topic = target.topics.find((x) => x.id === t.id);
      if (!topic) continue;
      if (typeof t.situation === "string") topic.situation = t.situation;
      if (typeof t.instruction === "string") topic.instruction = t.instruction;
      if (typeof t.keywords === "string") topic.keywords = t.keywords;
      if (typeof t.title === "string") topic.title = t.title;
      if (typeof t.marks === "number") topic.marks = t.marks;
    }
  }
  return next;
}
