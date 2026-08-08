import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default async function LandingPage() {
  const user = await getCurrentUser();
  return (
    <main className="min-h-screen exaai-gradient">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-lg font-bold tracking-tight">Exaai</span>
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link href="/dashboard" className={buttonVariants({ variant: "ghost" })}>
                Dashboard
              </Link>
              <Link href="/builder/new" className={buttonVariants()}>New exam</Link>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                Sign in
              </Link>
              <Link href="/register" className={buttonVariants()}>Start creating</Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-16 pb-20 text-center">
        <div className="absolute inset-x-0 top-0 -z-10 h-[480px] algerian-motif opacity-70 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]" />
        <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 text-sm font-medium text-primary shadow-sm backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Made for Algerian English teachers
        </span>
        <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Create complete English exams in minutes.{" "}
          <span className="text-primary">Keep every decision in your hands.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Exaai generates the reading text, the tasks and the marks from the exam structure. You
          review, edit, replace and approve. No API keys, no prompts, no technicalities.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            href={user ? "/builder/new" : "/register"}
            className={buttonVariants({ size: "lg", className: "h-12 px-8 text-base" })}
          >
            Start creating free
          </Link>
          <Link
            href={user ? "/dashboard" : "/login"}
            className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-8 text-base" })}
          >
            {user ? "Dashboard" : "Sign in"}
          </Link>
        </div>

        {/* Preview mock */}
        <div className="mt-16 w-full max-w-3xl rounded-2xl border bg-white/90 p-8 text-left shadow-xl backdrop-blur">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-sm font-bold text-foreground">A. Reading Comprehension</span>
            <span className="text-sm font-semibold text-emerald-700">07 pts</span>
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">The value of friendship</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A good friend is honest, kind and ready to listen when life becomes difficult. Young
            people who share their hobbies often develop strong friendships. Respecting differences
            helps classmates work together and avoid useless conflicts…
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-foreground">
              <span className="mr-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
                Task 1 — 2 pts
              </span>
              Answer the following questions according to the text.
            </p>
            <p className="text-foreground">
              <span className="mr-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
                Task 2 — 2 pts
              </span>
              Say whether the statements are true or false. Justify.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">A guided workflow, not a chat</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { n: "1", t: "Choose the parameters", d: "Level, grade, stream, length, unit and topic with dependent, validated dropdowns." },
            { n: "2", t: "Generate each section", d: "Reading text, comprehension tasks, text exploration and written expression, one step at a time." },
            { n: "3", t: "Review, replace, approve", d: "Edit anything. Swap a single weak task for a suitable alternative. Export to PDF or Word." },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border bg-white/80 p-6 shadow-sm backdrop-blur">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Control principle */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="rounded-2xl bg-primary p-10 text-primary-foreground shadow-xl sm:p-14">
          <h2 className="max-w-xl text-3xl font-bold leading-tight">
            Every generation is a proposal. You stay the author.
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-primary-foreground/85">
            Nothing is approved without you, nothing is overwritten silently, and nothing is lost
            when you generate again. Sources are attributed, marks are validated, and your exam is
            always yours.
          </p>
          <Link
            href={user ? "/builder/new" : "/register"}
            className={buttonVariants({ variant: "secondary", size: "lg", className: "mt-8 h-12 px-8 text-base" })}
          >
            Create your first exam
          </Link>
        </div>
      </section>

      <footer className="border-t bg-white/60 py-8 text-center text-sm text-muted-foreground">
        Exaai — exam creation, lightened. Made for English teachers in Algeria.
      </footer>
    </main>
  );
}
