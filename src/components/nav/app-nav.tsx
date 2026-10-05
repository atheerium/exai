"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Sparkles, LayoutDashboard, Library, Plus, LogOut, Languages, Star, Settings } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-client";

export function AppNav({ userName, isAdmin: admin = false }: { userName: string; isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, lang, setLang } = useI18n();

  const navLink = (href: string) =>
    cn(
      buttonVariants({ variant: "ghost", size: "sm" }),
      pathname === href && "border-foreground bg-primary text-primary-foreground shadow-sm hover:bg-primary"
    );

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    toast("Signed out", "info");
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded border-2 border-foreground bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-base font-extrabold tracking-tight">Exaai</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link href="/dashboard" className={navLink("/dashboard")}>
              <LayoutDashboard className="h-4 w-4" />
              {t("nav.dashboard")}
            </Link>
            <Link href="/library" className={navLink("/library")}>
              <Library className="h-4 w-4" />
              {t("nav.library")}
            </Link>
            <Link href="/favourites" className={navLink("/favourites")}>
              <Star className="h-4 w-4" />
              {t("nav.favourites")}
            </Link>
            {admin && (
              <Link href="/ops" className={navLink("/ops")}>
                <Settings className="h-4 w-4" />
                Ops
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/builder/new" className={buttonVariants({ variant: "outline", size: "sm", className: "hidden sm:inline-flex" })}>
            <Plus className="h-4 w-4" />
            {t("nav.newExam")}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            title="Language / Langue"
            onClick={() => setLang(lang === "en" ? "fr" : "en")}
          >
            <Languages className="h-4 w-4" />
            {lang === "en" ? "FR" : "EN"}
          </Button>
          <div className="hidden items-center gap-2 rounded-full border-2 border-foreground bg-card py-1 pl-2 pr-3 sm:flex">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {(userName || "T").charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[140px] truncate text-xs font-medium text-muted-foreground">{userName}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label={t("nav.logout")}
            title={t("nav.logout")}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
