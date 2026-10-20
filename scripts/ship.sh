#!/usr/bin/env bash
#
# scripts/ship.sh — the edit -> commit -> push -> deploy loop, in one command.
#
# Why this exists: the repo is git-connected to Vercel, so a push starts the
# production build on its own. Doing that by hand means running the gates, then
# working out WHICH deployment is yours. `vercel ls` renders a table for humans,
# and scraping that table is how you end up watching the wrong deployment (or a
# spinner that never resolves). This script resolves the deployment by the exact
# commit SHA (`-m githubCommitSha=`), blocks on `vercel inspect --wait`, and then
# curls the aliases so "Ready" is backed by an HTTP status instead of a guess.
#
# Usage:
#   npm run ship -- -m "fix(export): keep the word bank off the last item"
#   bash scripts/ship.sh -m "feat(ui): ..." --build     # also run next build
#   bash scripts/ship.sh --wait-only                    # did HEAD deploy?
#   bash scripts/ship.sh -m "..." --dry-run             # plan only
#
# Flags:
#   -m, --message <msg>   Commit message. Conventional Commits, required.
#       --build           Also run `npm run build` before committing. Slower,
#                         but catches build-only type errors before they reach
#                         Vercel. Recommended for changes outside src/lib.
#       --dry-run         Run the preflight, print the plan, change nothing.
#       --wait-only       Skip commit/push; wait on the deployment for HEAD.
#       --no-wait         Commit and push, do not wait for the build.
#       --deploy          If no git-triggered deployment appears, run
#                         `vercel deploy --prod` instead of giving up.
#       --branch <name>   Branch to push (default: current branch).
#       --skip-tests      Skip the test suite. Do not use unless you already
#                         ran it; it is the only thing that catches validator
#                         regressions.
#   -h, --help            Show this help.
#
# Deliberately NOT a gate: `npm run lint`. There is no eslint config installed
# and `next lint` drops into an interactive scaffold prompt and exits 1. See
# AGENTS.md landmine 1.
set -euo pipefail

readonly WAIT_TIMEOUT="${SHIP_WAIT_TIMEOUT:-15m}"
readonly POLL_SECONDS="${SHIP_POLL_SECONDS:-5}"
readonly POLL_ATTEMPTS="${SHIP_POLL_ATTEMPTS:-18}" # ~90s of webhook latency

MSG=""
DO_BUILD=0
DRY_RUN=0
WAIT_ONLY=0
NO_WAIT=0
ALLOW_DEPLOY=0
SKIP_TESTS=0
BRANCH=""

say()  { printf '\033[1m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[33m  !!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m  xx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  # Print the header comment block only: from line 3 until the first non-comment.
  sed -n '3,$p' "$0" | sed -n '/^#/!q;p' | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)    MSG="${2:-}"; [[ -n "$MSG" ]] || die "--message needs a value"; shift 2 ;;
    --build)         DO_BUILD=1; shift ;;
    --dry-run)       DRY_RUN=1; shift ;;
    --wait-only)     WAIT_ONLY=1; shift ;;
    --no-wait)       NO_WAIT=1; shift ;;
    --deploy)        ALLOW_DEPLOY=1; shift ;;
    --skip-tests)    SKIP_TESTS=1; shift ;;
    --branch)        BRANCH="${2:-}"; [[ -n "$BRANCH" ]] || die "--branch needs a value"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *)               die "unknown argument: $1 (try --help)" ;;
  esac
done

# --- preflight ---------------------------------------------------------------

git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository"
cd "$(git rev-parse --show-toplevel)"

command -v vercel >/dev/null 2>&1 || die "vercel CLI not found on PATH"

if [[ -f .vercel/project.json || -f .vercel/repo.json ]]; then
  ok "project linked (.vercel/)"
else
  die "no .vercel/ link. Run 'vercel link' first (it is gitignored by design)."
fi

[[ -z "$(git diff --name-only --diff-filter=U)" ]] || die "unresolved merge conflicts; finish the merge first"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ -z "$BRANCH" ]]; then BRANCH="$CURRENT_BRANCH"; fi

if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  die "on '$CURRENT_BRANCH' but asked to ship '$BRANCH'. Checkout that branch instead of pushing it from here."
fi

# AGENTS.md landmine 2: either pnpm file makes Vercel pick pnpm and fail
# ERR_PNPM_OUTDATED_LOCKFILE. They are not in .gitignore, so this is catchable.
for bad in pnpm-lock.yaml pnpm-workspace.yaml; do
  if [[ -e "$bad" ]]; then
    die "refusing to ship with $bad present — Vercel will switch to pnpm and fail. Delete it (AGENTS.md landmine 2)."
  fi
done

# `vercel ls <project>` is unambiguous; without a name the CLI infers it.
PROJECT="$(
  node -e '
    const fs = require("fs");
    let name = "";
    try {
      const j = JSON.parse(fs.readFileSync(".vercel/repo.json", "utf8"));
      const p = (j.projects || []).find((x) => (x.directory || ".") === ".");
      name = (p || j.projects?.[0] || {}).name || "";
    } catch {
      try { name = JSON.parse(fs.readFileSync(".vercel/project.json", "utf8")).projectName || ""; } catch {}
    }
    process.stdout.write(name);
  ' 2>/dev/null || true
)"
[[ -n "$PROJECT" ]] || die "could not read the project name from .vercel/"

ok "repo clean enough, branch '$BRANCH', project '$PROJECT'"

# --- helpers -----------------------------------------------------------------

# Pull fields out of `vercel ... --format json` without scraping the table.
# Usage: jsonq '<json>' '<dotted.path>'
jsonq() {
  node -e '
    const [raw, path] = [process.argv[1], process.argv[2]];
    const start = raw.indexOf("{");
    if (start < 0) process.exit(0);
    let j;
    try { j = JSON.parse(raw.slice(start)); } catch { process.exit(0); }
    const v = path.split(".").reduce((o, k) => (o == null ? o : o[k]), j);
    if (v === undefined || v === null) process.exit(0);
    process.stdout.write(typeof v === "object" ? JSON.stringify(v) : String(v));
  ' "$1" "$2"
}

# Find the deployment that belongs to a commit. Returns 1 if none has appeared.
deployment_for_sha() {
  local sha="$1" out url i
  for ((i = 1; i <= POLL_ATTEMPTS; i++)); do
    out="$(vercel ls "$PROJECT" --format json -m "githubCommitSha=$sha" 2>/dev/null || true)"
    url="$(jsonq "$out" 'deployments.0.url')"
    if [[ -n "$url" ]]; then
      printf '%s' "$url"
      return 0
    fi
    printf '  ... waiting for the git webhook (%ds/%ds)\n' "$((i * POLL_SECONDS))" "$((POLL_ATTEMPTS * POLL_SECONDS))" >&2
    sleep "$POLL_SECONDS"
  done
  return 1
}

# Block until the deployment reaches a terminal state. Prints "STATE<tab>URL".
wait_for_deployment() {
  local url="$1" out state
  out="$(vercel inspect "$url" --format json --wait --timeout "$WAIT_TIMEOUT" 2>/dev/null || true)"
  state="$(jsonq "$out" 'readyState')"
  [[ -n "$state" ]] || state="UNKNOWN"
  printf '%s\t%s\n' "$state" "$url"
}

# "Ready" is a claim; an HTTP status is evidence. Some aliases sit behind Vercel
# SSO (302 -> vercel.com/sso-api), which is expected and not a failure.
report_aliases() {
  local out aliases alias code
  out="$(vercel inspect "$1" --format json 2>/dev/null || true)"
  aliases="$(jsonq "$out" 'aliases')"
  [[ -n "$aliases" ]] || { warn "no aliases reported"; return 0; }
  node -e '
    const a = JSON.parse(process.argv[1]);
    for (const x of Array.isArray(a) ? a : []) console.log(x);
  ' "$aliases" | while read -r alias; do
    [[ -n "$alias" ]] || continue
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$alias/" 2>/dev/null || echo "000")"
    if [[ "$code" == "200" ]]; then
      ok "https://$alias  $code"
    elif [[ "$code" == "302" || "$code" == "401" ]]; then
      printf '  -- https://%s  %s (Vercel SSO, not public)\n' "$alias" "$code"
    else
      warn "https://$alias  $code"
    fi
  done
}

# --- wait-only: did HEAD deploy? ---------------------------------------------

if [[ "$WAIT_ONLY" == "1" ]]; then
  SHA="$(git rev-parse HEAD)"
  say "Resolving the deployment for $SHA"
  URL="$(deployment_for_sha "$SHA")" || die "no deployment for $SHA appeared. Was the push made? Try again with --deploy."
  ok "deployment $URL"
  IFS=$'\t' read -r STATE URL < <(wait_for_deployment "$URL")
  case "$STATE" in
    READY)  ok "state READY"; report_aliases "$URL" ;;
    ERROR|CANCELED) die "state $STATE — logs: vercel inspect $URL --logs" ;;
    *)      die "state $STATE after $WAIT_TIMEOUT" ;;
  esac
  exit 0
fi

# --- the plan ----------------------------------------------------------------

# How many local commits are not on the remote yet. A clean tree is not the same
# as "nothing to ship": another session (or the agent) may have committed and
# left the push for later, which is the common case for this script.
unpushed_count() {
  if git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null 2>&1; then
    git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0
  else
    # Branch not on the remote yet: publishing it is the job.
    echo 1
  fi
}

AHEAD="$(unpushed_count)"

# `--dry-run` must not touch the index either; report the plan from status.
if [[ "$DRY_RUN" == "1" ]]; then
  PLAN="$(git status --short)"
  if [[ -z "$PLAN" ]]; then
    ok "nothing to commit — working tree matches HEAD"
    if [[ "$AHEAD" == "0" ]]; then
      ok "nothing unpushed — HEAD is already on origin/$BRANCH"
      exit 0
    fi
    warn "would push $AHEAD unpushed commit(s), no new commit"
    warn "would run: npm run build is unaffected; gates still run"
    exit 0
  fi
  say "Would stage"
  printf '%s\n' "$PLAN"
  [[ -n "$MSG" ]] || die "a commit message is required: -m \"type(scope): summary\""
  say "Dry run — would commit on '$BRANCH' with: $MSG"
  if [[ "$SKIP_TESTS" == "0" ]]; then warn "would run: npm test"; fi
  warn "would run: npm run typecheck"
  if [[ "$DO_BUILD" == "1" ]]; then warn "would also run: npm run build"; fi
  warn "would run: git push origin $BRANCH"
  if [[ "$NO_WAIT" == "0" ]]; then warn "would then block on the Vercel build for the new SHA"; fi
  exit 0
fi

git add -A

STAT="$(git diff --cached --stat)"
SKIP_COMMIT=0
if [[ -z "$STAT" ]]; then
  if [[ "$AHEAD" == "0" ]]; then
    ok "nothing to commit and nothing unpushed — HEAD is already on origin/$BRANCH"
    exit 0
  fi
  ok "nothing to commit, but $AHEAD commit(s) are unpushed — pushing those"
  SKIP_COMMIT=1
else
  [[ -n "$MSG" ]] || die "a commit message is required: -m \"type(scope): summary\""
  say "Changes to commit"
  printf '%s\n' "$STAT"
fi

# --- gates -------------------------------------------------------------------

# Sequential on purpose: `npm run typecheck` and `next build` both use
# .next/types and a concurrent tsc reports phantom TS6053 errors. AGENTS.md
# landmine 11.
if [[ "$SKIP_TESTS" == "0" ]]; then
  say "npm test"
  npm test >/tmp/opencode/ship-test.log 2>&1 || {
    tail -30 /tmp/opencode/ship-test.log >&2
    die "tests failed (full log: /tmp/opencode/ship-test.log)"
  }
  PASSED="$(grep -oE '^[#ℹ ]*pass [0-9]+' /tmp/opencode/ship-test.log | tail -1 | grep -oE '[0-9]+' || true)"
  ok "${PASSED:-?} tests passed"
else
  warn "tests skipped (--skip-tests)"
fi

say "npm run typecheck"
npm run typecheck >/tmp/opencode/ship-typecheck.log 2>&1 || {
  tail -30 /tmp/opencode/ship-typecheck.log >&2
  die "typecheck failed (full log: /tmp/opencode/ship-typecheck.log)"
}
ok "types clean"

if [[ "$DO_BUILD" == "1" ]]; then
  say "npm run build"
  npm run build >/tmp/opencode/ship-build.log 2>&1 || {
    tail -40 /tmp/opencode/ship-build.log >&2
    die "build failed (full log: /tmp/opencode/ship-build.log)"
  }
  ok "build clean"
fi

# --- commit + push -----------------------------------------------------------

if [[ "$SKIP_COMMIT" == "0" ]]; then
  say "Committing"
  git commit -q -m "$MSG" || die "git commit failed"
  ok "$(git rev-parse --short HEAD)"
else
  say "No commit to make — shipping the $AHEAD existing commit(s)"
fi
SHA="$(git rev-parse HEAD)"
ok "$SHA"

say "Pushing to origin/$BRANCH"
git push origin "$BRANCH"
ok "pushed"

if [[ "$NO_WAIT" == "1" ]]; then
  say "Not waiting (--no-wait). Check with: bash scripts/ship.sh --wait-only"
  exit 0
fi

# --- deploy ------------------------------------------------------------------

say "Waiting for the Vercel deployment of $SHA"
URL="$(deployment_for_sha "$SHA")" || {
  if [[ "$ALLOW_DEPLOY" == "1" ]]; then
    warn "no git-triggered deployment; running vercel deploy --prod"
    URL="$(vercel deploy --prod --yes 2>&1 | tail -1)"
    [[ -n "$URL" ]] || die "vercel deploy returned nothing"
  else
    die "no deployment appeared for $SHA in $((POLL_ATTEMPTS * POLL_SECONDS))s. The git integration may be off; re-run with --deploy."
  fi
}
ok "deployment https://$URL"

IFS=$'\t' read -r STATE URL < <(wait_for_deployment "$URL")
case "$STATE" in
  READY) ok "state READY" ;;
  ERROR|CANCELED)
    warn "state $STATE"
    printf '\n--- last build log lines ---\n' >&2
    vercel inspect "$URL" --logs 2>&1 | tail -40 >&2 || true
    die "deployment failed — full logs: vercel inspect $URL --logs"
    ;;
  *) die "state $STATE after $WAIT_TIMEOUT — logs: vercel inspect $URL --logs" ;;
esac

say "Production aliases"
report_aliases "$URL"

printf '\n'
ok "shipped $SHA"
