import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { examToDto } from "@/lib/serialize";
import { LibraryView } from "@/components/dashboard/library";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const exams = await prisma.exam.findMany({
    where: { userId: user.id },
    include: { config: true, sources: true },
    orderBy: { updatedAt: "desc" },
  });
  const dtos = await Promise.all(exams.map((e) => examToDto(e)));
  return <LibraryView exams={dtos} />;
}
