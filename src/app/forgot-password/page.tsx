"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<{ devUrl?: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Something went wrong.", "error");
        return;
      }
      setDone(data);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center exaai-gradient px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white/90 p-8 text-center shadow-lg">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for that address, we sent a reset link. It expires in one hour.
          </p>
          {done.devUrl && (
            <div className="mt-4 rounded-lg border border-dashed bg-secondary/50 p-3 text-left text-xs">
              <p className="font-semibold text-muted-foreground">Development link</p>
              <a href={done.devUrl} className="mt-1 block break-all text-primary underline">
                {done.devUrl}
              </a>
            </div>
          )}
          <Button className="mt-6 w-full" onClick={() => setDone(null)} variant="outline">
            Request another link
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
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
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your account email and we will send you a reset link.
          </p>
        </div>
        <form onSubmit={onSubmit} className="rounded-2xl border bg-white/90 p-6 shadow-lg sm:p-8">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </div>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
