"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast(t("auth.passwordHint"), "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Registration failed", "error");
        return;
      }
      toast("Account created", "success");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center exaai-gradient px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-xl font-bold tracking-tight">Exaai</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{t("auth.registerTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.registerSub")}</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border bg-white/90 p-6 shadow-lg backdrop-blur sm:p-8">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("auth.name")}</Label>
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="flex items-center gap-2">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((p) => !p)} className="p-1 rounded hover:bg-primary/10">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("common.loading") : t("auth.register")}
            </Button>
          </div>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              {t("auth.login")}
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
