import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { examToDto } from "@/lib/serialize";
import { Dashboard } from "@/components/dashboard/dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [exams, favouritesCount, customsCount] = await Promise.all([
    prisma.exam.findMany({
      where: { userId: user.id, status: { not: "ARCHIVED" } },
      include: { config: true, sections: { include: { tasks: true, topics: true } }, sources: true },
      orderBy: { lastOpenedAt: "desc" },
      take: 12,
    }),
    prisma.favouriteTask.count({ where: { userId: user.id } }),
    prisma.customTask.count({ where: { userId: user.id } }),
  ]);
  const dtos = await Promise.all(exams.map((e) => examToDto(e)));
  return (
    <Dashboard
      exams={dtos}
      displayName={user.name ?? user.email}
      favouritesCount={favouritesCount}
      customsCount={customsCount}
    />
  );
}
