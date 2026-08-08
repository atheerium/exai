"use client";

import * as React from "react";
import { Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import type { ExamDto } from "@/types";

interface Catalog {
  levels: Record<
    string,
    {
      grade: string;
      label: string;
      streams: string[] | null;
      units: { key: string; label: string; topics: string[] }[];
    }[]
  >;
}

export function ParametersStage({
  exam,
  onSubmit,
}: {
  exam: ExamDto;
  onSubmit: (config: {
    level: string;
    grade: string;
    stream?: string | null;
    length: number;
    unit: string;
    topic: string;
    customTopic: boolean;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [level, setLevel] = React.useState(exam.config?.level ?? "");
  const [grade, setGrade] = React.useState(exam.config?.grade ?? "");
  const [stream, setStream] = React.useState(exam.config?.stream ?? "");
  const [length, setLength] = React.useState<number>(exam.config?.length ?? 150);
  const [unit, setUnit] = React.useState(exam.config?.unit ?? "");
  const [topic, setTopic] = React.useState(exam.config?.topic ?? "");
  const [customTopic, setCustomTopic] = React.useState(exam.config?.customTopic ?? false);
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
  const units = gradeDef?.units ?? [];
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast("Please complete all required parameters.", "error");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        level,
        grade,
        stream: streams.length ? stream : null,
        length,
        unit,
        topic: customTopic ? topic : topic,
        customTopic,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{t("builder.parameters")}</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {t("builder.parametersHelp")}
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("builder.level")}</Label>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} required>
            <option value="">{t("builder.selectLevel")}</option>
            {Object.keys(catalog?.levels ?? {}).map((l) => (
              <option key={l} value={l}>
                {l === "middle" ? "Middle school" : "Secondary school"}
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
            <option value="150">150 {t("builder.words")}</option>
            <option value="250">250 {t("builder.words")}</option>
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
              className="text-xs font-medium text-primary hover:underline"
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

        <div className="sm:col-span-2">
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!valid || busy}>
            <Sparkles className="h-4 w-4" />
            {busy ? t("common.generating") : t("builder.generateText")}
          </Button>
        </div>
      </form>
    </div>
  );
}
