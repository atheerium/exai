import { NextResponse } from "next/server";
import { requireUser, isAdmin } from "@/lib/auth";
import { loadFeedbackOverview } from "@/lib/feedback-data";

// Aggregation for the /ops page: recent teacher ratings plus the per-family
// counters. Admin-gated with the same helper the /ops page uses, because an admin
// read legitimately spans every teacher and therefore cannot run through
// `withRls`.
//
// The query itself lives in `lib/feedback-data.ts` and is SHARED with the page.
// It was originally written in both places and the two copies drifted
// (`createdAt`/30 here, `updatedAt`/20 there) — a dashboard that disagrees with
// its own API is worse than no dashboard.

export async function GET() {
  try {
    const user = await requireUser();
    if (!isAdmin(user)) return NextResponse.json({ error: "Admins only." }, { status: 403 });
    return NextResponse.json(await loadFeedbackOverview());
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in." }, { status: 401 });
    return NextResponse.json({ error: "Could not load feedback." }, { status: 500 });
  }
}