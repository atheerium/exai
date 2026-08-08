"use client";

import * as React from "react";
import { Sparkles, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { formatMarks } from "@/lib/utils";

export interface AltItem {
  key: string;
  prompt: string;
  marks?: number;
  meta?: string;
}

export function ReplacementModal({
  open,
  onClose,
  title,
  items,
  onSelect,
  onMore,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: AltItem[];
  onSelect: (index: number) => void;
  onMore?: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title} side="right" className="sm:max-w-xl">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("builder.alternatives")} — {t("builder.change")}
        </p>
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("builder.noAlternatives")}
            {onMore && (
              <Button variant="outline" size="sm" className="mt-3 block w-full" onClick={onMore} disabled={busy}>
                <Sparkles className="h-4 w-4" />
                {busy ? t("common.generating") : "Generate more"}
              </Button>
            )}
          </div>
        )}
        {items.map((item, i) => (
          <div key={item.key} className="rounded-xl border bg-secondary/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-6 whitespace-pre-line text-sm">{item.prompt}</p>
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                {typeof item.marks === "number" ? `${formatMarks(item.marks)} pts` : item.meta}
              </span>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={() => onSelect(i)}>
                <Check className="h-4 w-4" />
                {t("builder.select")}
              </Button>
            </div>
          </div>
        ))}
        {items.length > 0 && onMore && (
          <Button variant="outline" className="w-full" onClick={onMore} disabled={busy}>
            <Sparkles className="h-4 w-4" />
            {busy ? t("common.generating") : "Generate more alternatives"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
