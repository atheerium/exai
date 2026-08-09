import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Operator monitoring view (PRD sections 27, 29, US-030): AI generation
// ledger, product funnel events and guide governance metadata, admin-gated.

export default async function OpsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) notFound();

  const [generations, eventCounts, guides, recentEvents] = await Promise.all([
    prisma.generation.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { exam: { select: { title: true, userId: true } } },
    }),
    prisma.productEvent.groupBy({
      by: ["name"],
      _count: { _all: true },
      orderBy: { _count: { name: "desc" } },
    }),
    prisma.guideConfig.findMany({ orderBy: { key: "asc" } }),
    prisma.productEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const totalCostEstimates = {
    total: generations.length,
    failed: generations.filter((g) => g.status === "ERROR").length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI generation ledger, product events and guide governance. Admin only.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Generation health</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {totalCostEstimates.total} recent generations, {totalCostEstimates.failed} failed.
        </p>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Exam</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {generations.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{g.type}</td>
                  <td className="px-3 py-2">{g.provider}</td>
                  <td className="px-3 py-2">
                    <span className={g.status === "ERROR" ? "text-red-600" : "text-emerald-700"}>
                      {g.status === "ERROR" ? `${g.status}: ${g.error ?? ""}` : g.status}
                    </span>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2">{g.exam?.title ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(g.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Funnel events</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {eventCounts.map((e) => (
            <div key={e.name} className="rounded-lg border bg-white px-3 py-2">
              <p className="text-xs text-muted-foreground">{e.name}</p>
              <p className="text-lg font-bold">{e._count._all}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Latest: {recentEvents[0] ? `${recentEvents[0].name} at ${new Date(recentEvents[0].createdAt).toLocaleString()}` : "none"}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Guide governance (US-029)</h2>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Source ref</th>
              </tr>
            </thead>
            <tbody>
              {guides.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{g.key}</td>
                  <td className="px-3 py-2">{g.name}</td>
                  <td className="px-3 py-2">{g.version}</td>
                  <td className="px-3 py-2">{g.active ? "yes" : "no"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground">{g.sourceRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
