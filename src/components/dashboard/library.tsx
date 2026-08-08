"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Download, Trash2, Archive, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import type { ExamDto } from "@/types";

type Filter = "ALL" | "DRAFT" | "EXPORTED" | "ARCHIVED";

export function LibraryView({ exams }: { exams: ExamDto[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");

  const filtered = exams.filter((e) => {
    if (filter !== "ALL" && e.status !== filter) return false;
    if (q && !`${e.title} ${e.config?.grade ?? ""} ${e.config?.unit ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.library")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {exams.length} {exams.length === 1 ? "exam" : "exams"}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-56 pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["ALL", "DRAFT", "EXPORTED", "ARCHIVED"] as Filter[]).map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "ALL" ? "All" : f === "DRAFT" ? t("dashboard.draft") : f === "EXPORTED" ? t("dashboard.exported") : "Archived"}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-semibold">{t("dashboard.empty")}</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((exam) => (
            <LibraryCard key={exam.id} exam={exam} onChanged={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryCard({ exam, onChanged }: { exam: ExamDto; onChanged: () => void }) {
  const { t } = useI18n();
  const status = exam.status as string;
  const archived = status === "ARCHIVED";

  async function setStatus(next: string) {
    const res = await fetch(`/api/exams/${exam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      toast(next === "ARCHIVED" ? "Exam archived" : "Exam restored", "success");
      onChanged();
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/builder/${exam.id}`} className="line-clamp-2 font-semibold leading-snug hover:underline">
            {exam.title}
          </Link>
          <Badge variant={status === "EXPORTED" ? "success" : status === "ARCHIVED" ? "muted" : "default"}>
            {status === "EXPORTED" ? t("dashboard.exported") : status === "ARCHIVED" ? "Archived" : status === "NEW" ? t("dashboard.draft") : t("dashboard.active")}
          </Badge>
        </div>
        <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
          {exam.config ? `${exam.config.grade.toUpperCase()} · ${exam.config.unit} · ${exam.config.length} ${t("builder.words")}` : "No parameters yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dashboard.lastOpened")}: {new Date(exam.updatedAt).toLocaleDateString()}
        </p>
        <div className="mt-auto flex items-center gap-1 pt-4">
          <Link href={`/builder/${exam.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}>
            {t("dashboard.open")}
          </Link>
          <a
            href={`/api/exams/${exam.id}/export?format=pdf`}
            download
            className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-accent"
            title={t("builder.exportPdf")}
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </a>
          <button
            onClick={() => setStatus(archived ? "DRAFT" : "ARCHIVED")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent"
            title={archived ? "Restore" : t("dashboard.delete")}
          >
            {archived ? <FileText className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
