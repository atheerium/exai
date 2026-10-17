"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { MAX_COMMENT_LENGTH, type FeedbackRating } from "@/lib/feedback";

/**
 * Per-exam teacher rating.
 *
 * This is a signal to US about which task families produce bad output. It never
 * changes the exam and it must never reach a prompt.
 *
 * Two rules the shape below exists to satisfy:
 * - A comment box appears only for a thumbs DOWN. A bad exam deserves a reason;
 *   a good one does not need one.
 * - The stored rating is read back on mount, so the control never claims a
 *   state the database does not hold.
 */
export function ExamFeedback({ examId }: { examId: string }) {
  const [rating, setRating] = React.useState<FeedbackRating | null>(null);
  const [comment, setComment] = React.useState("");
  /** The comment the server last stored, so "Send reason" knows what is new. */
  const [savedComment, setSavedComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  /**
   * The last rating the SERVER confirmed. Optimistic updates revert to this,
   * not to whatever happened to be on screen, so a failure during the initial
   * load cannot restore a rating that was never stored.
   */
  const confirmed = React.useRef<FeedbackRating | null>(null);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  React.useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/exams/${examId}/feedback`);
        if (stale) return;
        // 404 means the exam is not this teacher's to rate. Leave the control
        // unselected rather than showing a rating that cannot be saved.
        if (!res.ok) return;
        const data = await res.json();
        if (stale || !data) return;
        const stored: FeedbackRating | null = data.rating === "UP" || data.rating === "DOWN" ? data.rating : null;
        const storedComment = typeof data.comment === "string" ? data.comment : "";
        confirmed.current = stored;
        setRating(stored);
        setComment(storedComment);
        setSavedComment(storedComment);
      } catch {
        // Network failure on load: leave it unselected, the teacher can still rate.
      }
    })();
    return () => {
      stale = true;
    };
  }, [examId]);

  async function submit(next: FeedbackRating, text: string) {
    if (busy) return;
    const previous = confirmed.current;
    setRating(next);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/exams/${examId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next, comment: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not save feedback.");
      confirmed.current = next;
      setComment(text);
      setSavedComment(text);
      if (alive.current) toast("Thanks. Your feedback tells us what to fix.", "success");
    } catch (e: unknown) {
      setRating(previous);
      toast(e instanceof Error ? e.message : "Could not save feedback.", "error");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function choose(next: FeedbackRating) {
    if (busy || rating === next) return;
    // Switching to a thumbs up clears the box and any stored reason: the
    // comment only ever explained a complaint.
    setComment("");
    void submit(next, "");
  }

  return (
    <section className="no-print rounded border-2 border-foreground bg-card p-5 shadow">
      <h2 className="text-lg font-extrabold tracking-tight">How was this exam?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us which tasks did not work. Your rating helps us fix the generator. It does not change your exam.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={rating === "UP" ? "default" : "outline"}
          aria-pressed={rating === "UP"}
          title="This exam was useful"
          disabled={busy}
          onClick={() => choose("UP")}
        >
          <span aria-hidden="true">👍</span> Good
        </Button>
        <Button
          variant={rating === "DOWN" ? "default" : "outline"}
          aria-pressed={rating === "DOWN"}
          title="This exam was not useful"
          disabled={busy}
          onClick={() => choose("DOWN")}
        >
          <span aria-hidden="true">👎</span> Not useful
        </Button>
      </div>

      {rating === "DOWN" && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`feedback-comment-${examId}`} className="text-sm font-medium">
            What went wrong?
          </label>
          <Textarea
            id={`feedback-comment-${examId}`}
            value={comment}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="For example: the passage did not support question 3."
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {comment.length}/{MAX_COMMENT_LENGTH} characters
            </span>
            <Button size="sm" disabled={busy || comment.trim() === savedComment.trim()} onClick={() => void submit("DOWN", comment)}>
              <Send /> Send reason
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}