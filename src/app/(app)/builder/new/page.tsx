"use client";
import { useTransition } from "react";
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
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create new exam"}
        </button>
      </form>
    </div>
  );
}
