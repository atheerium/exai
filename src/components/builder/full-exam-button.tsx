"use client";

import * as React from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, type I18nKey } from "@/lib/i18n";

/**
 * The full-draft entry point: one button that builds passage, Part One, Text
 * Exploration and Writing in a single server round trip.
 *
 * Progress is honest about what it knows. The API does not stream per-section
 * events, so the client cannot say "Part One done" truthfully — it only knows a
 * run is in flight. So it shows the phases as a plan and marks them active in
 * turn rather than asserting completion that never arrived. A fake progress bar
 * that reaches 100% and then fails is worse than an honest spinner.
 */
export function FullExamButton({
  enabled,
  busy,
  phase,
  disabled,
  onRun,
  onOverwrite,
  confirmOpen,
  onCancelOverwrite,
}: {
  enabled: boolean;
  busy: boolean;
  /** Current phase label, or null when idle. */
  phase: string | null;
  disabled: boolean;
  onRun: () => void;
  onOverwrite: () => void;
  confirmOpen: boolean;
  onCancelOverwrite: () => void;
}) {
  const { t } = useI18n();

  if (!enabled) return null;

  const phases = ["text", "partOne", "partTwo", "writing"];
  const phaseIndex = phase ? phases.indexOf(phase) : -1;

  if (confirmOpen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="full-exam-confirm"
          className="w-full max-w-md rounded border-2 border-foreground bg-card p-5 shadow"
        >
          <h2 id="full-exam-confirm" className="flex items-center gap-2 font-bold">
            <TriangleAlert className="h-4 w-4" />
            {t("builder.fullExamConfirmTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("builder.fullExamConfirmBody")}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancelOverwrite}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={onOverwrite}>
              {t("builder.fullExamConfirmAction")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" onClick={onRun} disabled={disabled || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? t("builder.fullExamRunning") : t("builder.fullExam")}
      </Button>
      {busy && (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          {phases.map((p, i) => {
            const state = phaseIndex < 0 ? "pending" : i < phaseIndex ? "done" : i === phaseIndex ? "active" : "pending";
            return (
              <li key={p} className={state === "active" ? "font-bold text-foreground" : undefined}>
                {state === "done" ? "✓ " : state === "active" ? "• " : ""}
                {t(`builder.fullExamPhase.${p}` as I18nKey)}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}