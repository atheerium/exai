"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Download, Trash2, Archive, Search, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-client";
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
          <h1 className="text-2xl font-extrabold tracking-tight">{t("nav.library")}</h1>
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
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded border-2 border-foreground bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-bold">
              {exams.length === 0 ? t("dashboard.empty") : "No exams match this view"}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {exams.length === 0
                ? t("dashboard.emptyD")
                : "Try another status, or clear the search to see all your exams."}
            </p>
            {exams.length === 0 ? (
              <Link href="/builder/new" className={buttonVariants({ className: "mt-4" })}>
                <Plus className="h-4 w-4" />
                {t("nav.newExam")}
              </Link>
            ) : (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setFilter("ALL");
                  setQ("");
                }}
              >
                {t("library.clearFilters")}
              </Button>
            )}
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
    const res = await apiFetch(`/api/exams/${exam.id}`, {
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
    <Card className="flex h-full flex-col transition-transform duration-100 hover:shadow-lg active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/builder/${exam.id}`} className="line-clamp-2 font-bold leading-snug hover:underline">
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
            className={buttonVariants({ variant: "outline", size: "sm" })}
            aria-label={t("builder.exportPdf")}
            title={t("builder.exportPdf")}
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </a>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStatus(archived ? "DRAFT" : "ARCHIVED")}
            aria-label={archived ? "Restore" : t("dashboard.delete")}
            title={archived ? "Restore" : t("dashboard.delete")}
          >
            {archived ? <FileText className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
