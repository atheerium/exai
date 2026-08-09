"use client";

import * as React from "react";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast("Password must be at least 6 characters.", "error");
      return;
    }
    if (password !== confirm) {
      toast("Passwords do not match.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not reset the password.", "error");
        return;
      }
      setDone(true);
      toast("Password updated. Sign in with your new password.", "success");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center exaai-gradient px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white/90 p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold tracking-tight">Invalid link</h1>
          <p className="mt-2 text-sm text-muted-foreground">This reset link is missing or invalid.</p>
          <Button className="mt-6 w-full" onClick={() => router.push("/forgot-password")}>
            Request a new link
          </Button>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center exaai-gradient px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white/90 p-8 text-center shadow-lg">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Password updated</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your password was changed successfully.</p>
          <Button className="mt-6 w-full" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        </div>
      </main>
    );
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
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Choose a new password</h1>
        </div>
        <form onSubmit={onSubmit} className="rounded-2xl border bg-white/90 p-6 shadow-lg sm:p-8">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Set new password"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
