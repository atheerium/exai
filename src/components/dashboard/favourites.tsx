"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, BookMarked, Trash2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { formatMarks } from "@/lib/utils";

interface SavedItem {
  id: string;
  label: string;
  content: { prompt: string; marks?: number; instruction?: string | null };
}

export function FavouritesView({ favourites, customs }: { favourites: SavedItem[]; customs: SavedItem[] }) {
  const { t } = useI18n();
  const router = useRouter();

  async function remove(kind: "favourite" | "custom", id: string) {
    await fetch(`/api/${kind === "favourite" ? "favourites" : "custom-tasks"}/${id}`, { method: "DELETE" });
    toast("Deleted", "success");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.favourites")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved tasks appear as tabs inside the replacement panel in the exam builder.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Favourites ({favourites.length})</h2>
          </div>
          {favourites.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Save a good task with the star button in the builder to reuse it here.
                </p>
                <Link href="/dashboard" className={buttonLink}>
                  <Sparkles className="h-4 w-4" /> Go to builder
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
            <h2 className="font-semibold">Custom tasks ({customs.length})</h2>
          </div>
          {customs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Create your own reusable tasks from the replacement panel, then use them in any exam.
                </p>
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

const buttonLink =
  "mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90";

function SavedCard({ item, onDelete }: { item: SavedItem; onDelete: () => void }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold">{item.label}</p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
              {typeof item.content.marks === "number" ? `${formatMarks(item.content.marks)} pts` : ""}
            </span>
            <Button variant="ghost" size="icon" onClick={onDelete} title="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{item.content.prompt}</p>
      </CardContent>
    </Card>
  );
}
