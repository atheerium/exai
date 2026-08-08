"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Minimal toast system: window event based, no provider nesting required.

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export function toast(message: string, kind: ToastKind = "info") {
  window.dispatchEvent(new CustomEvent("exai-toast", { detail: { message, kind } }));
}

let idc = 0;

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail as { message: string; kind: ToastKind };
      const id = ++idc;
      setItems((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
    };
    window.addEventListener("exai-toast", onToast);
    return () => window.removeEventListener("exai-toast", onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg animate-fade-in",
            t.kind === "success" && "border-emerald-200 text-emerald-900",
            t.kind === "error" && "border-red-200 text-red-900",
            t.kind === "info" && "border-zinc-200 text-zinc-900"
          )}
        >
          {t.kind === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
          {t.kind === "error" && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
          {t.kind === "info" && <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
