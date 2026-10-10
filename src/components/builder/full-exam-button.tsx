"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useI18n, type I18nKey } from "@/lib/i18n";
import type { PendingConfirmKind } from "./builder";

/**
 * The full-draft entry point: one button that builds passage, Part One, Text
 * Exploration and Writing in a single server round trip.
 *
 * Progress is honest about what it knows. The API does not stream per-section
 * events, so the client cannot say "Part One done" truthfully — it only knows a
 * run is in flight. So it shows the phases as a plan and marks the current one
 * active rather than asserting completion that never arrived. A bar that reaches
 * 100% and then fails is worse than an honest spinner.
 */
export function FullExamButton({
  enabled,
  busy,
  phase,
  disabled,
  onRun,
  confirm,
  onResolve,
}: {
  enabled: boolean;
  busy: boolean;
  /** Current phase label, or null when idle. */
  phase: string | null;
  disabled: boolean;
  onRun: () => void;
  confirm: { kind: PendingConfirmKind; hasAlternative: boolean } | null;
  onResolve: (which: "confirm" | "alternative" | "cancel") => void;
}) {
  const { t } = useI18n();

  if (!enabled) return null;

  const phases = ["text", "partOne", "partTwo", "writing"];
  const phaseIndex = phase ? phases.indexOf(phase) : -1;

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <Button type="button" onClick={onRun} disabled={disabled || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy ? t("builder.fullExamRunning") : t("builder.fullExam")}
        </Button>
        {busy && (
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            {phases.map((p, i) => {
              const state =
                phaseIndex < 0 ? "pending" : i < phaseIndex ? "done" : i === phaseIndex ? "active" : "pending";
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

      {confirm && <ConfirmDialog kind={confirm.kind} hasAlternative={confirm.hasAlternative} onResolve={onResolve} />}
    </>
  );
}

/**
 * The one confirmation surface for destructive exam actions, so none of them
 * falls back to an untranslated native dialog. `regenText` is the case with two
 * genuinely different outcomes, so it gets two buttons; the rest are yes/no.
 */
function ConfirmDialog({
  kind,
  hasAlternative,
  onResolve,
}: {
  kind: PendingConfirmKind;
  hasAlternative: boolean;
  onResolve: (which: "confirm" | "alternative" | "cancel") => void;
}) {
  const { t } = useI18n();

  const copy: Record<PendingConfirmKind, { title: I18nKey; body: I18nKey; action: I18nKey; alt?: I18nKey }> = {
    overwrite: {
      title: "builder.fullExamConfirmTitle",
      body: "builder.fullExamConfirmBody",
      action: "builder.fullExamConfirmAction",
    },
    regenText: {
      title: "builder.regenTextConfirmTitle",
      body: "builder.regenTextConfirmBody",
      action: "builder.regenTextConfirmKeep",
      alt: "builder.regenTextConfirmRedo",
    },
    rewrite: {
      title: "builder.rewriteConfirmTitle",
      body: "builder.rewriteConfirmBody",
      action: "builder.rewriteConfirmAction",
    },
  };
  const c = copy[kind];

  return (
    <Modal open onClose={() => onResolve("cancel")} title={t(c.title)}>
      <p className="text-sm text-muted-foreground">{t(c.body)}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onResolve("cancel")}>
          {t("common.cancel")}
        </Button>
        {hasAlternative && c.alt && (
          <Button type="button" variant="outline" onClick={() => onResolve("alternative")}>
            {t(c.alt)}
          </Button>
        )}
        <Button type="button" onClick={() => onResolve("confirm")}>
          {t(c.action)}
        </Button>
      </div>
    </Modal>
  );
}