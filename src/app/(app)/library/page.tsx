import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { examToDto } from "@/lib/serialize";
import { LibraryView } from "@/components/dashboard/library";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const exams = await prisma.exam.findMany({
    where: { userId: user.id },
    include: { config: true, sections: { include: { tasks: true, topics: true } }, sources: true },
    orderBy: { updatedAt: "desc" },
  });
  const dtos = await Promise.all(exams.map((e) => examToDto(e)));
  return <LibraryView exams={dtos} />;
}
