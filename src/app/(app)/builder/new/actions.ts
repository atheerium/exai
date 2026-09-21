"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function createNewExam() {
  const user = await requireUser();
  const exam = await prisma.exam.create({
    data: { userId: user.id, title: "Untitled exam", status: "NEW" },
  });
  redirect(`/builder/${exam.id}`);
}
