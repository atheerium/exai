"use client";

import * as React from "react";
import { History, RotateCcw, Plus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

interface Revision {
  id: string;
  label: string;
  createdAt: string;
}

export function VersionsModal({
  open,
  onClose,
  examId,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  examId: string;
  onRestored: () => void;
}) {
  const [revisions, setRevisions] = React.useState<Revision[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [restoring, setRestoring] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/exams/${examId}/revisions`);
      const data = await res.json();
      if (res.ok) setRevisions(data.revisions ?? []);
    } catch {
      /* non-fatal */
    }
  }, [examId]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function checkpoint() {
    setBusy(true);
    try {
      const res = await fetch(`/api/exams/${examId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Manual checkpoint" }),
      });
      if (!res.ok) throw new Error("failed");
      toast("Checkpoint saved", "success");
      load();
    } catch {
      toast("Could not save a checkpoint.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    if (!confirm("Restore this version? Current work will be replaced (it stays available as a newer revision).")) return;
    setRestoring(id);
    try {
      const res = await fetch(`/api/exams/${examId}/revisions/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      toast("Version restored", "success");
      onRestored();
      load();
    } catch (e: any) {
      toast(e?.message ?? "Could not restore.", "error");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Versions" side="right" className="sm:max-w-xl">
      <div className="space-y-3">
        <Button variant="outline" size="sm" className="w-full" onClick={checkpoint} disabled={busy}>
          <Plus className="h-4 w-4" />
          {busy ? "Saving…" : "Save a checkpoint now"}
        </Button>
        {revisions.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No saved versions yet. Each generation or replacement creates one automatically.
          </p>
        ) : (
          revisions.map((r) => (
            <div key={r.id} className="rounded-xl border bg-secondary/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => restore(r.id)} disabled={restoring === r.id}>
                  {restoring === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Restore
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

export function VersionsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} title="Version history">
      <History className="h-3.5 w-3.5" />
      Versions
    </Button>
  );
}
