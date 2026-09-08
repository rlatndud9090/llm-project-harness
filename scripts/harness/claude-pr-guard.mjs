#!/usr/bin/env node
// ClaudeCode PreToolUse guard — PR-creation gate (tool-specific accelerator, opt-in).
//
// Closes a defect CLASS, not a single bug: the harness treats "creating a PR" as a
// natural-language convention only, so an instruction Claude Code injects into a
// background session — on an isolated worktree it tells the session to "preserve the
// work before finishing" by opening a DRAFT pull request (agent-view docs) — can
// create a PR the harness flow never sanctioned. Two symptoms fall out of that class:
//   (a) a draft PR appears right after $feature-develop, before the user ever invoked
//       $make-pr (no final approval was ever recorded), and
//   (b) even $make-pr's own PR comes out as a draft.
// Both share ONE machine-checkable signal: the harness flow ALWAYS makes a
// ready-for-review PR (harness/protocols/make-pr.md Phase 4), whereas Claude Code's
// auto-preservation PR is ALWAYS a draft. So, within a harness work-unit context, this
// guard blocks:
//   1. any draft PR (`gh pr create --draft` / GitHub MCP `draft:true`) — closes
//      (a)+(b) with the single strongest signal, and
//   2. a feature unit's PR when its state.md carries no final APPROVAL event yet (the
//      $make-pr stamp) — a second, ready-PR-too defense against (a).
//
// SCOPE / fail-open — this must never obstruct an ordinary `gh pr create`. It acts
// ONLY when BOTH hold: the current branch parses as a harness work branch
// (<type>/<slug> or the EnterWorktree form worktree-<type>+<slug>) AND its
// docs/raw/<type>/<slug>/state.md exists. Outside that — this provider repo editing
// itself, a non-harness repo, main, or a pre-kickoff branch — it exits 0. bugfix/chore
// units have no approval axis, so only the draft block (rule 1) applies to them; rule 2
// is feature-only, so a bugfix/chore ready PR is never a false "unapproved" positive.
//
// The sanctioned path is unaffected: $make-pr records the final APPROVAL via
// `harness:approve --final` in Phase 1 and pushes a ready PR in Phase 4, so by the
// time `gh pr create` runs the APPROVAL exists and `--draft` is absent.
//
// COVERAGE / assumptions (be honest about the edges):
//   - PR creators covered: the `gh` CLI (`gh pr create`) and any MCP tool whose name
//     ends in `create_pull_request` (so github, github-personal, plugin-form GitHub MCP
//     are all caught, not just `mcp__github__`).
//   - The work unit is judged from the CURRENT git branch, NOT from `--head`. A PR
//     created from main with `--head <work-branch>` fails open — intended, so this
//     provider repo's own main self-edits are never blocked. Isolated sessions sit on
//     the work branch, so the normal flow is covered.
//   - This assumes Claude Code's auto-preservation draft PR is opened by a MODEL tool
//     call (agent-view: "Claude opens one"), which a PreToolUse hook can intercept. If a
//     runtime ever opened it directly (no tool call), it would be out of reach — the
//     ready-PR invariant in make-pr.md is the parallel natural-language defense.
//   - A PR's draft state is NOT checked by harness:check (git-time), so for draft this
//     hook is the only enforcement point — there is no git-time backstop behind it.
//
// Why cwd matters: lib.mjs's git/file helpers are all bound to REPO_ROOT
// (=process.cwd() at import), which in a hook process is NOT the consumer repo. So —
// exactly like claude-approval-guard — we import only PURE helpers (parseWorkBranch,
// parseApprovalEvents) and read git/state ourselves against payload.cwd.
//
// Contract: reads the PreToolUse JSON on stdin; exit 2 + stderr blocks the call
// (works even under bypassPermissions). Any parse/read/spawn error fails open (exit 0)
// so a hook bug never wedges normal work — harness:check remains the git-time backstop.
// Wired in hooks/hooks.json as a PreToolUse (Bash|mcp__github__create_pull_request)
// hook via `node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/claude-pr-guard.mjs"`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseApprovalEvents, parseWorkBranch } from "./lib.mjs";

// `gh pr create` anywhere in the command — tolerant of any prefix
// (`env -u GITHUB_TOKEN gh …`), path, or extra whitespace.
const GH_PR_CREATE_RE = /\bgh\s+pr\s+create\b/;
// The draft flag as its own argument token: the long `--draft` (optionally `--draft=…`)
// or gh's short `-d`. Both are matched against a command whose quoted substrings have
// been removed (see stripQuoted), so a `--draft`/`-d` literal appearing only inside a
// `--title`/`--body` value never counts — that was a false-block source. With quotes
// gone, `-d` is unambiguous (gh pr create has no other `-d` option), so it is safe to
// include and closes the short-form gap.
const DRAFT_FLAG_RE = /(?:^|\s)(?:--draft(?:[\s=]|$)|-d(?:\s|$))/;

// Blanks out single/double-quoted substrings so flag detection ignores flags that only
// appear inside a quoted value (a --title/--body text). Best-effort shell-ish handling
// (honours backslash-escapes within a quote); good enough for a fail-open tripwire.
function stripQuoted(command) {
  return command.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, " ");
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    run(raw);
  } catch {
    process.exit(0); // fail open
  }
});

function run(input) {
  const payload = JSON.parse(input || "{}");
  const tool = payload.tool_name;
  const toolInput = payload.tool_input ?? {};

  // Quote-stripped view of a Bash command: used for BOTH "is this gh pr create" and the
  // draft-flag test, so a `gh pr create` / `--draft` literal buried in a quoted value
  // (e.g. `echo "gh pr create --draft"`, or a --body describing the flag) never counts.
  const strippedCommand =
    tool === "Bash" && typeof toolInput.command === "string" ? stripQuoted(toolInput.command) : null;
  const isBashPr = strippedCommand !== null && GH_PR_CREATE_RE.test(strippedCommand);
  // Any MCP PR creator, not just `mcp__github__` (covers github-personal, plugin-form).
  const isMcpPr = typeof tool === "string" && tool.endsWith("create_pull_request");
  if (!isBashPr && !isMcpPr) process.exit(0); // not a PR-creating call → nothing to do

  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();

  // Gate only inside a harness work-unit context; otherwise fail open.
  const branch = currentBranch(cwd);
  const parsed = branch ? parseWorkBranch(branch) : null;
  if (!parsed || parsed.invalid) process.exit(0); // main / non-harness / provider self-edit

  const stateContent = readState(cwd, parsed.type, parsed.slug);
  if (stateContent === null) process.exit(0); // no raw unit yet → not a sanctioned harness PR context

  // Rule 1 — no draft PRs in the harness flow (closes both symptoms).
  const draft = isBashPr ? DRAFT_FLAG_RE.test(strippedCommand) : toolInput.draft === true;
  if (draft) {
    block(
      `draft PR 차단: 하네스 흐름은 PR을 항상 ready-for-review로 만든다.\n` +
        `격리 background 세션이 종료 시 자동으로 여는 "작업 보존"용 draft PR이거나, $make-pr가 실수로 --draft를 붙인 경우다.\n` +
        `해결: gh pr create에서 --draft를 빼고(또는 GitHub MCP는 draft:false로) ready PR로 만드세요.\n` +
        `이미 draft로 열렸다면 gh pr ready <번호>로 전환하세요.`,
    );
  }

  // Rule 2 — a feature unit's PR requires the $make-pr final stamp (blocks the
  // unsanctioned ready PR too). bugfix/chore have no approval axis, so they are exempt.
  if (parsed.type === "feature") {
    const hasFinalApproval = parseApprovalEvents(stateContent).some((e) => e.kind === "APPROVAL");
    if (!hasFinalApproval) {
      block(
        `무단 PR 차단: feature 단위인데 state.md에 최종 확정(APPROVAL) 이벤트가 없습니다.\n` +
          `$make-pr를 호출하지 않았는데 PR을 만들려는 상황입니다(격리 세션의 자동 보존 지침일 수 있음).\n` +
          `PR은 $make-pr가 만듭니다 — $make-pr는 사용자 명시 호출을 근거로 harness:approve --final로 확정한 뒤 push·PR합니다.\n` +
          `아직 최종 확정 전이면 $make-pr로 넘어가세요(사전 승인 전이면 $prd-helper/$adr-helper).`,
      );
    }
  }

  process.exit(0);
}

// Current branch of the consumer repo at `cwd`. Tries rev-parse then symbolic-ref so
// an unborn branch (no commits yet) still resolves. Non-git / any error → null
// (fail safe: the caller then fails open).
function currentBranch(cwd) {
  for (const args of [
    ["rev-parse", "--abbrev-ref", "HEAD"],
    ["symbolic-ref", "--short", "HEAD"],
  ]) {
    try {
      const branch = execFileSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (branch && branch !== "HEAD") return branch;
    } catch {
      // try the next form
    }
  }
  return null;
}

// Reads docs/raw/<type>/<slug>/state.md under `cwd`, or null when absent/unreadable.
function readState(cwd, type, slug) {
  try {
    return fs.readFileSync(path.join(cwd, "docs", "raw", type, slug, "state.md"), "utf8");
  } catch {
    return null;
  }
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
