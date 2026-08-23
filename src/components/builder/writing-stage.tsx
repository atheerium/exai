"use client";

import * as React from "react";
import { RefreshCw, Sparkles, BookOpen, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { getGuide } from "@/data/guides";
import { formatMarks } from "@/lib/utils";
import type { ExamDto, SectionDto, TopicDto } from "@/types";
import { ReplacementModal, type AltItem } from "./replacement-modal";

function EditableMarks({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    setEditing(false);
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= 0 && num !== value) {
      onChange(Math.round(num * 10) / 10);
    } else {
      setDraft(String(value));
    }
  }

  if (editing) {
    return (
      <Input
        type="number"
        min="0"
        step="0.5"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="h-6 w-16 px-1 py-0 text-xs font-semibold"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
      title="Click to edit marks"
    >
      {formatMarks(value)} {value === 1 ? "mark" : "marks"}
      <Pencil className="h-2.5 w-2.5 opacity-50" />
    </button>
  );
}

export function WritingStage({
  exam,
  section,
  generating,
  onGenerate,
  onEdit,
  onReplace,
  onMoreAlternatives,
}: {
  exam: ExamDto;
  section?: SectionDto;
  generating: boolean;
  onGenerate: () => void;
  onEdit: (patch: any) => void;
  onReplace: (topicId: string, index: number) => void;
  onMoreAlternatives: (topicId: string) => void;
}) {
  const { t } = useI18n();
  const guide = exam.config ? getGuide(exam.config.grade, exam.config.language ?? "en", exam.config.stream ?? undefined) : null;
  const [replacing, setReplacing] = React.useState<TopicDto | null>(null);
  const [moreBusy, setMoreBusy] = React.useState(false);

  const topics = (section?.topics ?? []).sort((a, b) => a.order - b.order);
  const guided = topics.find((x) => x.kind === "GUIDED");
  const free = topics.find((x) => x.kind === "FREE");

  async function moreAlternatives() {
    if (!replacing) return;
    setMoreBusy(true);
    try {
      await onMoreAlternatives(replacing.id);
    } finally {
      setMoreBusy(false);
    }
  }

  const topicThreshold = guide?.writing.singleTopic ? 1 : 2;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{guide?.headings?.writing ?? "C. Written expression"}</h2>
        <p className="mt-1 text-sm font-semibold text-emerald-700">
          {guide ? `${formatMarks(guide.marks.writing)} pts` : "05 pts"}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">{t("builder.writingHelp")}</p>

      {topics.length < topicThreshold ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          {generating ? (
            <div className="mx-auto max-w-md space-y-3 px-6">
              <Skeleton className="mx-auto h-4 w-56" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{guide?.writing.singleTopic ? "Generate the writing topic to finish the exam." : "Generate the two writing topics to finish the exam."}</p>
              <Button onClick={onGenerate} className="mt-4" size="lg">
                <Sparkles className="h-4 w-4" />
                {t("builder.generateWriting")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {guided && <TopicCard topic={guided} index={1} onChange={(patch) => onEdit({ sections: [{ id: section!.id, topics: [{ id: guided.id, ...patch }] }] })} onReplace={() => setReplacing(guided)} />}
          {free && <TopicCard topic={free} index={2} onChange={(patch) => onEdit({ sections: [{ id: section!.id, topics: [{ id: free.id, ...patch }] }] })} onReplace={() => setReplacing(free)} />}
        </div>
      )}

      {replacing && (
        <ReplacementModal
          open
          onClose={() => setReplacing(null)}
          title={`${t("builder.alternatives")} — ${replacing.kind === "GUIDED" ? t("builder.topic1") : t("builder.topic2")}`}
          items={(replacing.candidates ?? []).map((c: any, i: number): AltItem => ({
            key: `${replacing.id}-alt-${i}`,
            prompt: [c.title, c.situation, c.instruction, c.keywords ? `Key words: ${c.keywords}` : ""].filter(Boolean).join("\n\n"),
            marks: c.marks ?? replacing.marks,
          }))}
          onSelect={(index) => {
            onReplace(replacing.id, index);
            setReplacing(null);
          }}
          onMore={moreAlternatives}
          busy={moreBusy}
        />
      )}
    </div>
  );
}

function TopicCard({
  topic,
  index,
  onChange,
  onReplace,
}: {
  topic: TopicDto;
  index: number;
  onChange: (patch: any) => void;
  onReplace: () => void;
}) {
  const { t } = useI18n();
  const guided = topic.kind === "GUIDED";
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            {guided ? t("builder.topic1") : t("builder.topic2")}
          </span>
          <Badge variant={guided ? "default" : "outline"}>{guided ? t("builder.guided") : t("builder.free")}</Badge>
          <span className="text-xs font-semibold text-muted-foreground">
            <EditableMarks
              value={topic.marks}
              onChange={(v) => onChange({ marks: v })}
            />
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onReplace}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t("builder.changeTopic")}
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        <Input
          value={topic.title ?? ""}
          placeholder={guided ? t("builder.topic1") : t("builder.topic2")}
          onChange={(e) => onChange({ title: e.target.value })}
          className="font-semibold"
        />
        <Textarea
          value={topic.situation ?? ""}
          placeholder="Situation"
          onChange={(e) => onChange({ situation: e.target.value })}
          className="min-h-[72px] text-sm"
        />
        <Textarea
          value={topic.instruction ?? ""}
          placeholder="Instructions"
          onChange={(e) => onChange({ instruction: e.target.value })}
          className="min-h-[64px] text-sm"
        />
        {guided && (
          <div className="flex items-center gap-2 rounded-lg border bg-secondary/40 px-3 py-2">
            <BookOpen className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">{t("builder.keywords")}:</span>
            <Input
              value={topic.keywords ?? ""}
              onChange={(e) => onChange({ keywords: e.target.value })}
              className="h-8 flex-1 text-xs"
            />
          </div>
        )}
        {!guided && (
          <p className="text-xs text-muted-foreground">No keyword help for this topic.</p>
        )}
      </div>
    </div>
  );
}
