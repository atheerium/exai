# Requirements — exaai

Saved via clarify-requirements intake. Source: user answers, 2026-09-23.

## Q1. What problem does this solve? Who experiences it and how often?

**A:** Algerian high-school English teachers currently buy static, outdated exam documents (zips/WinRAR archives) as digital products. The problem was surfaced by the user's partner, an English teacher. Pain: fixed, non-customizable old exams vs. a modern, fully customizable, teacher-friendly tool. Frequency: every exam-preparation cycle (recurring need).

## Q2. Who are the primary users?

**A:** Algerian high-school English teachers preparing official exams. (Literally this — no broader segment.)

## Q3. What are the 3 most important features for V1? (priority order)

**A:**
1. Generate a **full exam** that follows the **exact patterns and exam guide for Algerian high school** (Ministry guide).
2. Full teacher **customization** of the generated exam.
3. Export to **PDF** and **Word** (Word for further editing).

## Q4. What is explicitly out of scope for this version?

**A:** Algeria-specific **high school only**. Ignore middle school. Ignore other countries' exam patterns.

## Q5. Preferred tech stack, or constraints?

**A:** Already built — Supabase + Vercel + Next.js (the existing Exaai repo).

## Q6. Hard constraints: deadline, budget, must-integrate-with, compliance?

**A:** None.

## Q7. What does success look like 30 days after launch?

**A:** A teacher can fully generate a comprehensive exam following the Algerian ministry guide, fully customize it, and export PDF or Word for further editing.

---

## Notes

- Stack is fixed (existing codebase); this intake is product-requirements clarity, not greenfield architecture.
- Scope lock: secondary/high school (1AS–3AS) only; middle school (`1AM–4AM`) and non-Algerian patterns remain out of scope.
- No open questions marked by user.
