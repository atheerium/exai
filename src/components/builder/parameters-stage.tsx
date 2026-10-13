"use client";

import * as React from "react";
import { Sparkles, Info, ChevronDown, ChevronUp, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { ConfirmDialog } from "./full-exam-button";
import type { ParametersConfig, PendingConfirmKind } from "./builder";
import type { ExamDto } from "@/types";
import { getGuide } from "@/data/guides";
import { ALLOWED_PARAGRAPH_COUNTS, DEFAULT_PARAGRAPH_COUNT } from "@/lib/guide";

interface Catalog {
  levels: Record<
    string,
    {
      grade: string;
      label: string;
      streams: string[] | null;
      units: { key: string; label: string; topics: string[]; streams?: string[] }[];
    }[]
  >;
}

/**
 * The one-click full-generation control.
 *
 * Rendered in BOTH the expanded form and the collapsed summary bar, because the
 * stage collapses automatically as soon as a config exists
 * (`useState(!!exam.config)`) — the collapsed bar is what the teacher actually
 * sees after setting parameters, so putting the button only in the form would
 * hide it exactly when it is most wanted.
 */
function FullExamAction({
  onRun,
  busy,
  disabled,
  size,
  className,
  replacing,
}: {
  onRun: () => void;
  busy: boolean;
  disabled: boolean;
  size?: "sm" | "lg";
  className?: string;
  replacing?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Button type="button" size={size} className={className} onClick={onRun} disabled={disabled || busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {busy ? t("builder.fullExamRunning") : replacing ? t("builder.fullExamReplace") : t("builder.fullExam")}
    </Button>
  );
}

const LEVEL_LABELS: Record<string, string> = {
  middle: "Middle school",
  secondary: "Secondary school",
};

export function ParametersStage({
  exam,
  collapsed,
  onToggleCollapse,
  onSubmit,
  onGenerateFullExam,
  onSaveAndGenerateFullExam,
  fullExamBusy,
  anyGenerationBusy,
  hasContent,
  confirm: confirmPrompt,
  onResolveConfirm,
}: {
  exam: ExamDto;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * One-click full generation. Rendered only once parameters are SAVED, because
   * the full-exam call needs a persisted config to read grade, unit and marks
   * from. The form's own submit button saves and then generates the passage
   * alone, which is the cheaper first step and stays that way.
   */
  onGenerateFullExam?: () => void;
  /**
   * Save-then-build-the-whole-exam. Wired to the same button when the form has
   * NOT been saved yet, so the teacher can generate a complete exam in one click
   * from a fresh form instead of being forced through Save (which only generates
   * the passage).
   */
  onSaveAndGenerateFullExam?: (config: ParametersConfig) => void;
  fullExamBusy?: boolean;
  anyGenerationBusy?: boolean;
  /**
   * True once the exam holds anything, which makes the button a REPLACE rather
   * than a create. The API still refuses without an explicit confirm; this only
   * tells the teacher that before they click, instead of surprising them with a
   * dialog afterwards.
   */
  hasContent?: boolean;
  /**
   * The overwrite confirmation. The Parameters stage renders the SAME dialog the
   * top-bar button uses, because the 409 it answers is raised by the button the
   * teacher just pressed -- a dialog that appears in a different corner of the
   * page is easy to miss, and a missed dialog looks exactly like "the button
   * only generated the text".
   */
  confirm?: { kind: PendingConfirmKind; hasAlternative: boolean } | null;
  onResolveConfirm?: (which: "confirm" | "alternative" | "cancel") => void;
  onSubmit: (config: ParametersConfig) => Promise<void>;
}) {
  const { t } = useI18n();
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [level, setLevel] = React.useState(exam.config?.level ?? "");
  const [grade, setGrade] = React.useState(exam.config?.grade ?? "");
  const [stream, setStream] = React.useState(exam.config?.stream ?? "");
  const [length, setLength] = React.useState<number>(exam.config?.length ?? 150);
  const [paragraphCount, setParagraphCount] = React.useState<number>(
    exam.config?.paragraphCount ?? DEFAULT_PARAGRAPH_COUNT
  );
  const [difficulty, setDifficulty] = React.useState(exam.config?.difficulty ?? "Standard");
  const [unit, setUnit] = React.useState(exam.config?.unit ?? "");
  const [topic, setTopic] = React.useState(exam.config?.topic ?? "");
  const [customTopic, setCustomTopic] = React.useState(exam.config?.customTopic ?? false);
  const [teacherKeywords, setTeacherKeywords] = React.useState(exam.config?.teacherKeywords ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => {});
  }, []);

  const grades = level ? catalog?.levels[level] ?? [] : [];
  const gradeDef = grades.find((g) => g.grade === grade);
  const streams = gradeDef?.streams ?? [];
  const allUnits = gradeDef?.units ?? [];
  const units = allUnits.filter((u) => !u.streams || !stream || u.streams.includes(stream));
  const unitDef = units.find((u) => u.key === unit);
  const topics = unitDef?.topics ?? [];

  // Reset dependent fields when their parent changes
  React.useEffect(() => {
    setGrade("");
    setStream("");
    setUnit("");
    setTopic("");
  }, [level]);
  React.useEffect(() => {
    setStream("");
    setUnit("");
    setTopic("");
  }, [grade]);
  React.useEffect(() => {
    setUnit("");
    setTopic("");
  }, [stream]);
  React.useEffect(() => {
    setTopic("");
  }, [unit]);

  const valid = level && grade && unit && topic && (!streams.length || stream);

  /**
   * The full-exam button is offered as soon as the FORM is valid, not only once
   * a config is saved. Gating it on `hasConfig` meant the only reachable first
   * action was "generate the text", which is precisely what the button exists to
   * avoid. Saving is handled by the parent, so an invalid payload still cannot
   * reach generation.
   */
  const fullExamRunnable = !!(onGenerateFullExam || onSaveAndGenerateFullExam) && !!valid;

  /** The payload both submit paths send, built once so they cannot drift. */
  function currentConfig(): ParametersConfig {
    return {
      level,
      grade,
      stream: streams.length ? stream : null,
      length,
      paragraphCount,
      unit,
      topic: customTopic ? topic : topic,
      customTopic,
      teacherKeywords: teacherKeywords?.trim() ? teacherKeywords.trim() : null,
      difficulty: difficulty ?? "Standard",
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast("Please complete all required parameters.", "error");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(currentConfig());
    } finally {
      setBusy(false);
    }
  }

  // Collapsed summary view
  if (collapsed && exam.config) {
    const config = exam.config;
    const streamLabel = config.stream ? ` · ${config.stream}` : "";
    return (
      <>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-lg font-extrabold tracking-tight">{t("builder.parameters")}</h2>
          <p className="text-sm text-muted-foreground">
            {config.grade}{streamLabel} · {config.unit} · {config.topic} · {config.length} {t("builder.words")}
            {config.teacherKeywords ? ` · "${config.teacherKeywords}"` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Rendered here, not only in the top bar: see onResolveConfirm. */}
          {onGenerateFullExam && (
            <FullExamAction
              onRun={onGenerateFullExam}
              busy={!!fullExamBusy}
              disabled={!!anyGenerationBusy}
              replacing={hasContent}
              size="sm"
            />
          )}
          <Button variant="outline" size="sm" onClick={onToggleCollapse}>
            <Pencil className="h-3.5 w-3.5" />
            {t("builder.editParameters")}
          </Button>
        </div>
      </div>
      {confirmPrompt && onResolveConfirm ? (
        <ConfirmDialog kind={confirmPrompt.kind} hasAlternative={confirmPrompt.hasAlternative} onResolve={onResolveConfirm} />
      ) : null}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">{t("builder.parameters")}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {t("builder.parametersHelp")}
          </p>
        </div>
        {collapsed === false && exam.config && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="shrink-0"
            aria-label={t("builder.collapse")}
            title={t("builder.collapse")}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        )}
      </div>

      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("builder.level")}</Label>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} required>
            <option value="">{t("builder.selectLevel")}</option>
            {Object.keys(catalog?.levels ?? {})
              .map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l] ?? l}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("builder.grade")}</Label>
          <Select value={grade} onChange={(e) => setGrade(e.target.value)} required disabled={!level}>
            <option value="">{t("builder.selectGrade")}</option>
            {grades.map((g) => (
              <option key={g.grade} value={g.grade}>
                {g.label}
              </option>
            ))}
          </Select>
        </div>

        {streams.length > 0 && (
          <div className="space-y-1.5">
            <Label>{t("builder.stream")}</Label>
            <Select value={stream} onChange={(e) => setStream(e.target.value)} required disabled={!grade}>
              <option value="">{t("builder.selectStream")}</option>
              {streams.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("builder.length")}</Label>
          <Select value={String(length)} onChange={(e) => setLength(Number(e.target.value))} disabled={!grade}>
            {grade ? (() => {
              const guide = getGuide(grade);
              // lengthOptions are upper bounds; pair consecutive values into ranges.
              // e.g. [120, 150] → "120–150 words"; [120, 150, 200] → "120–150" + "150–200"
              const options = guide.lengthOptions.slice(1).map((upper, i) => {
                const lower = guide.lengthOptions[i];
                return (
                  <option key={upper} value={upper}>
                    {lower}–{upper} {t("builder.words")}
                  </option>
                );
              });
              return options;
            })() : (
              <>
                <option value="150">150 {t("builder.words")}</option>
                <option value="200">200 {t("builder.words")}</option>
              </>
            )}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("builder.paragraphs")}</Label>
          <Select
            value={String(paragraphCount)}
            onChange={(e) => setParagraphCount(Number(e.target.value))}
            disabled={!grade}
          >
            {/* 3 or 4 only: the passage arc is lead → aspects → close, so other
                counts do not produce a well-formed paper (see guide.ts). */}
            {ALLOWED_PARAGRAPH_COUNTS.map((n) => (
              <option key={n} value={n}>
                {t("builder.paragraphsValue").replace("{n}", String(n))}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{t("builder.paragraphsHelp")}</p>
        </div>

        <div className="space-y-1.5">
          <Label>{t("builder.difficulty")}</Label>
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={!grade}>
            <option value="Standard">{t("builder.standard")}</option>
            <option value="Harder">{t("builder.harder")}</option>
            <option value="Simpler">{t("builder.simpler")}</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("builder.unit")}</Label>
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} required disabled={!grade}>
            <option value="">{t("builder.selectUnit")}</option>
            {units.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label>{t("builder.topic")}</Label>
            <button
              type="button"
              onClick={() => {
                setCustomTopic(!customTopic);
                if (!customTopic) setTopic("");
              }}
              className="text-[13px] font-medium text-primary hover:underline"
            >
              {customTopic ? t("builder.selectTopic") : t("builder.customTopic")}
            </button>
          </div>
          {customTopic ? (
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("builder.customTopicPlaceholder")}
            />
          ) : (
            <Select value={topic} onChange={(e) => setTopic(e.target.value)} required disabled={!unit}>
              <option value="">{t("builder.selectTopic")}</option>
              {topics.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Teacher keywords */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("builder.keywordsLabel")}</Label>
          <Input
            value={teacherKeywords}
            onChange={(e) => setTeacherKeywords(e.target.value)}
            placeholder={t("builder.keywordsPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("builder.keywordsHelp")}</p>
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!valid || busy}>
            <Sparkles className="h-4 w-4" />
            {busy ? t("common.generating") : t("builder.generateText")}
          </Button>
        </div>
      </form>

      {(fullExamRunnable || onGenerateFullExam) && (
        // Not a form submit: it must not re-run the passage call, only build
        // every section. When the config is NOT yet saved it saves first, so a
        // complete exam is one click from a fresh form (teacher report
        // 2026-10-13) instead of forcing Save -> passage -> full exam.
        <div className="border-t-2 border-foreground/10 pt-4">
          <FullExamAction
            onRun={() => {
              if (onSaveAndGenerateFullExam) onSaveAndGenerateFullExam(currentConfig());
              else onGenerateFullExam?.();
            }}
            busy={!!fullExamBusy}
            disabled={!!anyGenerationBusy || !fullExamRunnable}
            replacing={hasContent}
            size="lg"
            className="w-full"
          />
          <p className="mt-2 text-xs text-muted-foreground">{t("builder.fullExamHelp")}</p>
        </div>
      )}
      {confirmPrompt && onResolveConfirm ? (
        <ConfirmDialog kind={confirmPrompt.kind} hasAlternative={confirmPrompt.hasAlternative} onResolve={onResolveConfirm} />
      ) : null}
    </div>
  );
}
