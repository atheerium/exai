"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FileText, Download, Trash2, Clock, ChevronRight, Star, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import type { ExamDto } from "@/types";

export function Dashboard({
  exams,
  displayName,
  favouritesCount = 0,
  customsCount = 0,
}: {
  exams: ExamDto[];
  displayName: string;
  favouritesCount?: number;
  customsCount?: number;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [creating, setCreating] = React.useState(false);

  async function newExam() {
    setCreating(true);
    try {
      const res = await fetch("/api/exams", { method: "POST" });
      const exam = await res.json();
      if (!res.ok) throw new Error(exam.error);
      router.push(`/builder/${exam.id}`);
    } catch {
      toast("Could not create an exam.", "error");
      setCreating(false);
    }
  }

  const last = exams.find((e) => e.status !== "EXPORTED") ?? exams[0];
  const recent = exams.slice(0, 6);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("dashboard.welcome")}, {displayName.split(" ")[0] || "teacher"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.title")}</p>
        </div>
        <Button onClick={newExam} disabled={creating} className="h-11 px-6">
          <Plus className="h-4 w-4" />
          {t("dashboard.newExam")}
        </Button>
      </div>

      {/* Continue Last Exam */}
      {last && (
        <Card className="overflow-hidden">
          <Link href={`/builder/${last.id}`} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("dashboard.continueLast")}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{last.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {last.config && (
                    <>
                      <span className="rounded bg-secondary px-2 py-0.5 font-medium">{last.config.grade.toUpperCase()}</span>
                      <span>{last.config.unit}</span>
                      <span>·</span>
                      <span>{last.config.length} {t("builder.words")}</span>
                    </>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(last.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              {t("dashboard.open")} <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        </Card>
      )}

      {/* Favourites + custom tasks entry */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/favourites">
          <Card className="group transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Star className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h3 className="font-semibold">{t("nav.favourites")}</h3>
                <p className="text-xs text-muted-foreground">
                  {favouritesCount} saved · {customsCount} custom
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/library">
          <Card className="group transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookMarked className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h3 className="font-semibold">{t("nav.library")}</h3>
                <p className="text-xs text-muted-foreground">{exams.length} exams</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Empty state or recent exams */}
      {recent.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-7 w-7" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{t("dashboard.empty")}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("dashboard.emptyD")}</p>
            <Button onClick={newExam} className="mt-6">
              <Plus className="h-4 w-4" />
              {t("dashboard.newExam")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("dashboard.recent")}</h2>
            <Link href="/library" className="text-sm font-medium text-primary hover:underline">
              {t("nav.library")} →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExamCard({ exam }: { exam: ExamDto }) {
  const router = useRouter();
  const { t } = useI18n();
  const status = exam.status as string;

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this exam permanently?")) return;
    await fetch(`/api/exams/${exam.id}`, { method: "DELETE" });
    toast("Exam deleted", "success");
    router.refresh();
  }

  return (
    <Link href={`/builder/${exam.id}`}>
      <Card className="group h-full transition-shadow hover:shadow-md">
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 font-semibold leading-snug">{exam.title}</h3>
            <Badge variant={status === "EXPORTED" ? "success" : status === "DRAFT" ? "muted" : "default"}>
              {status === "EXPORTED" ? t("dashboard.exported") : status === "NEW" ? t("dashboard.draft") : t("dashboard.active")}
            </Badge>
          </div>
          <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
            {exam.config ? `${exam.config.grade.toUpperCase()} · ${exam.config.unit}` : "No parameters yet"}
          </p>
          <div className="mt-auto flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              {t("dashboard.lastOpened")}: {new Date(exam.lastOpenedAt).toLocaleDateString()}
            </span>
            <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
              <a
                href={`/api/exams/${exam.id}/export?format=pdf`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary"
                title={t("builder.exportPdf")}
                download
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={remove}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title={t("dashboard.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
