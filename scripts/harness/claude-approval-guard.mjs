#!/usr/bin/env node
// ClaudeCode PreToolUse guard (tool-specific accelerator, opt-in).
//
// A runtime tripwire, ONE STEP AHEAD of the git-time backstop. It blocks the
// common self-approval edit paths through the Edit/Write/MultiEdit tools, for BOTH
// approval tiers (pre-approved/pre-accepted build-entry gate, and approved/accepted
// final stamp at $make-pr):
//   - prd.md / adr.md whose resulting `status:` is pre-approved/approved/
//     pre-accepted/accepted
//   - state.md whose resulting `prd_status`/`adr_status` moves onto the approval
//     axis, or that introduces a `- PREAPPROVAL ...` / `- APPROVAL ...` ledger line
//   - adr.md edited while the sibling state.md stage is still pre-ADR (the PRD
//     phase): $prd-helper must not drift into ADR authoring — the ADR is authored
//     only after $adr-helper advances the stage to adr-draft.
// Only `npm run harness:approve` should set the approval statuses, and it writes
// via Node fs (not the Edit/Write tools), so the sanctioned path never trips
// this hook. Editing the BODY of an already-(pre-)approved artifact is allowed, so
// mid-build revisions of a pre-approved PRD/ADR pass.
//
// It inspects the RECONSTRUCTED post-edit file (not just the edit fragment), so
// a value-only edit (old_string "review" -> new_string "approved") is caught,
// and the filename match is case-insensitive.
//
// This is NOT a complete runtime gate: Bash writes (sed/tee/redirect), file
// renames, and MCP/remote writers are out of a PreToolUse matcher's reach. The
// load-bearing, non-bypassable gate is the harness check run in CI (see
// harness/protocols/lph-init.md). The plugin wires this guard as a PreToolUse
// (Edit|Write|MultiEdit) hook in hooks/hooks.json via
// `node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/claude-approval-guard.mjs"`.
//
// Contract: reads the PreToolUse JSON on stdin; exit 2 + stderr blocks the call
// (works even under bypassPermissions). Any parse/read error fails open (exit 0)
// so a hook bug never wedges normal editing — harness:check remains the backstop.
import fs from "node:fs";
import path from "node:path";
import { isPreAdrStage, normalizeEol, parseFrontmatter } from "./lib.mjs";

// Both approval tiers are guarded: pre-approved/pre-accepted (build-entry gate)
// and approved/accepted (final at $make-pr). Only harness:approve may set any of
// them, and it writes via fs (not the Edit tools), so it never trips this.
const STATUS_FLIP_RE = /^\s*status:\s*["']?(pre-approved|approved|pre-accepted|accepted)\b/m;
const APPROVAL_LINE_RE = /^\s*-\s*(PREAPPROVAL|APPROVAL)\s+(prd|adr)\b/m;
const PRD_APPROVAL_STATUSES = new Set(["pre-approved", "approved"]);
const ADR_APPROVAL_STATUSES = new Set(["pre-accepted", "accepted"]);
const GUARDED_BASENAMES = new Set(["prd.md", "adr.md", "state.md"]);

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
  if (!["Edit", "Write", "MultiEdit"].includes(payload.tool_name)) process.exit(0);

  const toolInput = payload.tool_input ?? {};
  const filePath = String(toolInput.file_path ?? "");
  const base = path.basename(filePath).toLowerCase();
  if (!GUARDED_BASENAMES.has(base)) process.exit(0);

  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();

  // Step-separation gate: block ADR authoring while the unit is still in the PRD
  // phase. This is independent of any status flip — even an ordinary body edit to
  // adr.md is refused until the stage advances to adr-draft.
  if (base === "adr.md") {
    const stage = preAdrStageFor(cwd, filePath);
    if (stage) {
      process.stderr.write(
        `단계 분리 차단: adr.md — state.md stage가 "${stage}"입니다 (아직 ADR 단계가 아닙니다).\n` +
          `PRD 단계($prd-helper)에서는 adr.md를 편집하지 않습니다. ADR 필요 여부와 이유는 prd.md "## ADR 필요 여부"에 적으세요.\n` +
          `ADR을 작성하려면 먼저 $adr-helper로 넘어가 state.md의 stage를 adr-draft로 올린 뒤 adr.md를 작성하세요.`,
      );
      process.exit(2);
    }
  }

  const currentContent = readCurrent(cwd, filePath);
  const nextContent = reconstruct(payload, toolInput, currentContent);

  const reason = violation(base, currentContent, nextContent, toolInput);
  if (reason) {
    process.stderr.write(
      `승인 게이트 차단: ${base} — ${reason}\n` +
        `승인 상태 전환은 손으로 편집하지 말고, 사용자의 명시 승인을 받은 뒤 오직 다음 명령으로만 하세요:\n` +
        `  npm run harness:approve -- --unit <docs/raw/feature/slug> --quote "<사용자 승인 발화>" [--adr]\n` +
        `사용자가 아직 명시 승인하지 않았다면 승인 상태로 바꾸지 말고 review/proposed로 두세요.`,
    );
    process.exit(2);
  }

  process.exit(0);
}

// Returns the current pre-ADR stage of the unit owning `filePath` (read from the
// sibling state.md), or null when the ADR phase has been entered, the ledger is
// missing/unparseable, or the stage is unknown. Null means "do not gate" — the
// git-time harness:check backs this up.
function preAdrStageFor(cwd, filePath) {
  try {
    const stateFile = path.join(path.dirname(path.resolve(cwd, filePath)), "state.md");
    const stage = parseFrontmatter(fs.readFileSync(stateFile, "utf8"))?.stage;
    return isPreAdrStage(stage) ? stage : null;
  } catch {
    return null; // no sibling state.md / unreadable → fail open
  }
}

// 이 가드는 절대 파일을 쓰지 않고 판정만 한다. 그래서 읽는 즉시 EOL을 정규화한다.
// CRLF 워킹트리(Windows 기본값)에서 도구가 넘기는 old_string은 LF인 경우가 많은데,
// 그러면 아래 literal split이 한 군데도 못 찾아 "편집 전 = 편집 후"로 재구성되고,
// 승인 플립이 감지되지 않은 채 통과한다(fail-open이라 조용히 뚫린다). 양쪽을 같은
// 정규형으로 맞춰야 그 우회가 닫힌다.
function readCurrent(cwd, filePath) {
  try {
    return normalizeEol(fs.readFileSync(path.resolve(cwd, filePath), "utf8"));
  } catch {
    return null; // new file (Write) or unreadable; reconstruct falls back below
  }
}

// Best-effort reconstruction of the post-edit content. Literal (non-regex)
// replacement, and applies to all occurrences so detection over-approximates
// rather than misses. Falls back to the raw fragments when the current file is
// unavailable, so a value-only Edit is still caught whenever the file exists.
// 도구가 준 조각도 readCurrent와 같은 정규형으로 맞춘다(위 주석 참고).
function reconstruct(payload, toolInput, currentContent) {
  const fragment = (value) => (typeof value === "string" ? normalizeEol(value) : null);

  if (payload.tool_name === "Write") {
    return fragment(toolInput.content) ?? currentContent ?? "";
  }
  if (payload.tool_name === "MultiEdit" && Array.isArray(toolInput.edits)) {
    let text = currentContent;
    if (text === null) return toolInput.edits.map((edit) => fragment(edit?.new_string) ?? "").join("\n");
    for (const edit of toolInput.edits) {
      const oldFragment = fragment(edit?.old_string);
      const newFragment = fragment(edit?.new_string);
      if (oldFragment !== null && newFragment !== null) {
        text = text.split(oldFragment).join(newFragment);
      }
    }
    return text;
  }
  // Edit
  const oldStr = fragment(toolInput.old_string) ?? "";
  const newStr = fragment(toolInput.new_string) ?? "";
  if (currentContent === null) return newStr; // fragment fallback
  return oldStr ? currentContent.split(oldStr).join(newStr) : `${currentContent}\n${newStr}`;
}

function violation(base, currentContent, nextContent, toolInput) {
  const next = parseFrontmatter(nextContent) ?? {};
  const cur = currentContent !== null ? (parseFrontmatter(currentContent) ?? {}) : {};

  if (base === "prd.md" || base === "adr.md") {
    // Only a NEWLY introduced approval flip is blocked (either tier); editing the
    // body of an already-(pre-)approved artifact is fine, so mid-build revisions of
    // a pre-approved PRD/ADR are not obstructed.
    const approvalStatuses = base === "prd.md" ? PRD_APPROVAL_STATUSES : ADR_APPROVAL_STATUSES;
    if (approvalStatuses.has(next.status) && next.status !== cur.status) {
      return `status를 "${next.status}"로 전환하려고 합니다`;
    }
    // Fragment fallback (file could not be reconstructed): scan raw fragments.
    if (currentContent === null && fragmentsFlip(toolInput)) {
      return "status를 pre-approved/approved/pre-accepted/accepted로 전환하려고 합니다";
    }
    return null;
  }

  // state.md — approval axis only, and only when newly introduced. Stage
  // progression (e.g. pre-approved -> implementing) stays allowed; recording the
  // (pre-)approval evidence is approve.mjs's exclusive domain.
  if (PRD_APPROVAL_STATUSES.has(next.prd_status) && next.prd_status !== cur.prd_status) {
    return `prd_status를 "${next.prd_status}"로 바꾸려고 합니다 (approve.mjs 전용)`;
  }
  if (ADR_APPROVAL_STATUSES.has(next.adr_status) && next.adr_status !== cur.adr_status) {
    return `adr_status를 "${next.adr_status}"로 바꾸려고 합니다 (approve.mjs 전용)`;
  }
  const hadApproval = currentContent !== null && APPROVAL_LINE_RE.test(currentContent);
  if (!hadApproval && APPROVAL_LINE_RE.test(nextContent)) {
    return "승인 이벤트(- PREAPPROVAL/APPROVAL ...)를 직접 추가하려고 합니다 (approve.mjs 전용)";
  }
  return null;
}

function fragmentsFlip(toolInput) {
  const fragments = [];
  if (typeof toolInput.content === "string") fragments.push(toolInput.content);
  if (typeof toolInput.new_string === "string") fragments.push(toolInput.new_string);
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (edit && typeof edit.new_string === "string") fragments.push(edit.new_string);
    }
  }
  return fragments.some((text) => STATUS_FLIP_RE.test(text));
}
