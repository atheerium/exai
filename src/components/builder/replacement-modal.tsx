"use client";

import * as React from "react";
import { Sparkles, Check, Star, BookMarked, Trash2, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { formatMarks } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface AltItem {
  key: string;
  prompt: string;
  marks?: number;
  meta?: string;
}

interface SavedItem {
  id: string;
  label: string;
  content: { prompt: string; instruction?: string | null; answer?: string | null; marks?: number; skill?: string | null };
}

export function ReplacementModal({
  open,
  onClose,
  title,
  items,
  onSelect,
  onMore,
  busy,
  examId,
  taskId,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: AltItem[];
  onSelect: (index: number) => void;
  onMore?: () => void;
  busy?: boolean;
  examId?: string;
  taskId?: string;
  onApplied?: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<"alternatives" | "favourites" | "custom">("alternatives");
  const [favourites, setFavourites] = React.useState<SavedItem[]>([]);
  const [customs, setCustoms] = React.useState<SavedItem[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [marks, setMarks] = React.useState("1");
  const [saving, setSaving] = React.useState(false);

  const loadSaved = React.useCallback(async () => {
    if (!examId || !taskId) return;
    try {
      const [f, c] = await Promise.all([
        fetch("/api/favourites").then((r) => r.json()),
        fetch("/api/custom-tasks").then((r) => r.json()),
      ]);
      setFavourites(f.items ?? []);
      setCustoms(c.items ?? []);
    } catch {
      /* non-fatal */
    }
  }, [examId, taskId]);

  React.useEffect(() => {
    if (open) {
      setTab("alternatives");
      if (taskId) loadSaved();
    }
  }, [open, taskId, loadSaved]);

  async function apply(item: SavedItem, source: "favourite" | "custom") {
    if (!examId || !taskId) return;
    try {
      const res = await fetch(`/api/exams/${examId}/apply-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, source, ...item.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Task applied", "success");
      onApplied?.();
      onClose();
    } catch (e: any) {
      toast(e?.message ?? "Could not apply task.", "error");
    }
  }

  async function createCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !label.trim()) {
      toast("Label and prompt are required.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/custom-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), prompt: prompt.trim(), marks: Number(marks) || 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Custom task saved", "success");
      setShowForm(false);
      setLabel("");
      setPrompt("");
      setMarks("1");
      loadSaved();
    } catch (e: any) {
      toast(e?.message ?? "Could not save.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: SavedItem, source: "favourite" | "custom") {
    await fetch(`/api/${source === "favourite" ? "favourites" : "custom-tasks"}/${item.id}`, { method: "DELETE" });
    loadSaved();
  }

  const tabs = [
    { key: "alternatives" as const, label: t("builder.alternatives"), icon: Sparkles },
    { key: "favourites" as const, label: t("nav.favourites"), icon: Star, disabled: !taskId },
    { key: "custom" as const, label: "Custom tasks", icon: BookMarked, disabled: !taskId },
  ];

  return (
    <Modal open={open} onClose={onClose} title={title} side="right" className="sm:max-w-xl">
      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-secondary/60 p-1">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => !tb.disabled && setTab(tb.key)}
            disabled={tb.disabled}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === tb.key ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              tb.disabled && "cursor-not-allowed opacity-40"
            )}
          >
            <tb.icon className="h-3.5 w-3.5" />
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "alternatives" && (
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("builder.noAlternatives")}
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
      )}

      {tab === "favourites" && (
        <SavedList
          items={favourites}
          empty="Save a good task with the star button to reuse it here."
          onApply={(item) => apply(item, "favourite")}
          onRemove={(item) => remove(item, "favourite")}
        />
      )}

      {tab === "custom" && (
        <div className="space-y-3">
          {!showForm && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> New custom task
            </Button>
          )}
          {showForm && (
            <form onSubmit={createCustom} className="space-y-3 rounded-xl border bg-secondary/40 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Vocabulary: closest meaning" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prompt</Label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[90px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                  placeholder="Type the task exactly as students should see it."
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="w-24 space-y-1.5">
                  <Label className="text-xs">Marks</Label>
                  <Input value={marks} onChange={(e) => setMarks(e.target.value)} type="number" step="0.5" min="0" />
                </div>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? t("common.loading") : t("common.save")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          )}
          <SavedList
            items={customs}
            empty="Create your own reusable task to use it across exams."
            onApply={(item) => apply(item, "custom")}
            onRemove={(item) => remove(item, "custom")}
          />
        </div>
      )}
    </Modal>
  );
}

function SavedList({
  items,
  empty,
  onApply,
  onRemove,
}: {
  items: SavedItem[];
  empty: string;
  onApply: (item: SavedItem) => void;
  onRemove: (item: SavedItem) => void;
}) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{item.label}</p>
            <div className="flex shrink-0 items-center gap-1">
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                {typeof item.content.marks === "number" ? `${formatMarks(item.content.marks)} pts` : ""}
              </span>
              <button onClick={() => onRemove(item)} className="rounded p-1 text-muted-foreground hover:text-destructive" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{item.content.prompt}</p>
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => onApply(item)}>
              <Check className="h-4 w-4" />
              Use
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
