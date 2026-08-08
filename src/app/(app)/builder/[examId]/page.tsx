import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadExamDto } from "@/lib/serialize";
import { Builder } from "@/components/builder/builder";

export default async function BuilderPage({ params }: { params: Promise<{ examId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { examId } = await params;
  let exam;
  try {
    exam = await loadExamDto(examId, user.id);
  } catch (e: any) {
    if (e?.message === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Builder initialExam={exam} />
    </div>
  );
}
