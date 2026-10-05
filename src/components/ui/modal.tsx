"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

// Lightweight modal + side sheet, no external dependencies.
// Works as a centered dialog (default) or right-hand sheet (side="right").

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  side,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: "center" | "right";
}) {
  const { t } = useI18n();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/50 animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 w-full rounded border-2 border-foreground bg-card shadow-lg animate-fade-in",
          side === "right"
            ? "h-[90dvh] sm:max-w-lg rounded-b-none sm:rounded-b overflow-y-auto"
            : "sm:max-w-2xl max-h-[90dvh] overflow-y-auto",
          className
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-foreground bg-card px-5 py-3">
          <div className="text-sm font-bold">{title}</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("builder.dismiss")}
            title={t("builder.dismiss")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
