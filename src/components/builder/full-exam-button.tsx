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
 * Progress is deliberately just a spinner. An earlier version showed the four
 * phases with the current one marked active, but the API streams no per-section
 * events, so the phase never advanced and the display was machinery around a
 * constant — it implied progress reporting that did not exist. If per-section
 * progress is ever wanted, the server has to emit it; faking it client-side is
 * worse than admitting the wait.
 */
export function FullExamButton({
  enabled,
  busy,
  disabled,
  onRun,
  confirm,
  onResolve,
}: {
  enabled: boolean;
  busy: boolean;
  disabled: boolean;
  onRun: () => void;
  confirm: { kind: PendingConfirmKind; hasAlternative: boolean } | null;
  onResolve: (which: "confirm" | "alternative" | "cancel") => void;
}) {
  const { t } = useI18n();

  if (!enabled) return null;

  return (
    <>
      <Button type="button" onClick={onRun} disabled={disabled || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? t("builder.fullExamRunning") : t("builder.fullExam")}
      </Button>

      {/* No dialog here. `Modal` is a fixed inset-0 overlay, so a second
          instance would stack a second dimmer and a second focus trap on top of
          the one the Parameters stage already renders. The dialog lives there
          only; it appears wherever the teacher pressed the button because it is
          an overlay, not because of where it sits in the DOM. */}
    </>
  );
}

/**
 * The one confirmation surface for destructive exam actions, so none of them
 * falls back to an untranslated native dialog. `regenText` is the case with two
 * genuinely different outcomes, so it gets two buttons; the rest are yes/no.
 */
/**
 * Exported because the Parameters stage renders the SAME dialog for its own
 * full-exam button. Duplicating it would mean two copies of the wording and the
 * alternative/confirm/cancel logic to keep in step.
 */
export function ConfirmDialog({
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