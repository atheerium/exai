"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, BookMarked, Trash2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { formatMarks } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

interface SavedItem {
  id: string;
  label: string;
  content: { prompt: string; marks?: number; instruction?: string | null };
}

export function FavouritesView({ favourites, customs }: { favourites: SavedItem[]; customs: SavedItem[] }) {
  const { t } = useI18n();
  const router = useRouter();

  async function remove(kind: "favourite" | "custom", id: string) {
    await apiFetch(`/api/${kind === "favourite" ? "favourites" : "custom-tasks"}/${id}`, { method: "DELETE" });
    toast("Deleted", "success");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("nav.favourites")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved tasks appear as tabs inside the replacement panel in the exam builder.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            <h2 className="font-bold">Favourites ({favourites.length})</h2>
          </div>
          {favourites.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Save a good task with the star button in the builder to reuse it here.
                </p>
                <Link href="/dashboard" className={buttonVariants({ className: "mt-4" })}>
                  <Sparkles className="h-4 w-4" /> {t("nav.dashboard")}
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {favourites.map((f) => (
                <SavedCard key={f.id} item={f} onDelete={() => remove("favourite", f.id)} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-primary" />
            <h2 className="font-bold">Custom tasks ({customs.length})</h2>
          </div>
          {customs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Create your own reusable tasks from the replacement panel, then use them in any exam.
                </p>
                <Link href="/dashboard" className={buttonVariants({ className: "mt-4" })}>
                  <Sparkles className="h-4 w-4" /> {t("nav.dashboard")}
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {customs.map((c) => (
                <SavedCard key={c.id} item={c} onDelete={() => remove("custom", c.id)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SavedCard({ item, onDelete }: { item: SavedItem; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-bold">{item.label}</p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {typeof item.content.marks === "number" ? `${formatMarks(item.content.marks)} pts` : ""}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={t("dashboard.delete")}
              title={t("dashboard.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{item.content.prompt}</p>
      </CardContent>
    </Card>
  );
}
