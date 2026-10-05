"use client";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createNewExam } from "./actions";

export default function NewExamPage() {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">New Exam</h1>
      <form
        action={() => startTransition(createNewExam)}
        className="mt-4"
      >
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "Creating..." : "Create new exam"}
        </Button>
      </form>
    </div>
  );
}
