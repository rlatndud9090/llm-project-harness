#!/usr/bin/env node
// ClaudeCode PreToolUse guard (tool-specific accelerator, opt-in).
//
// A runtime tripwire, ONE STEP AHEAD of the git-time backstop. It blocks the
// common self-approval edit paths through the Edit/Write/MultiEdit tools:
//   - prd.md / adr.md whose resulting `status:` is approved/accepted
//   - state.md whose resulting `prd_status: approved` / `adr_status: accepted`,
//     or that introduces an `- APPROVAL ...` ledger line
//   - adr.md edited while the sibling state.md stage is still pre-ADR (the PRD
//     phase): $prd-helper must not drift into ADR authoring — the ADR is authored
//     only after $adr-helper advances the stage to adr-draft.
// Only `npm run harness:approve` should set the approval statuses, and it writes
// via Node fs (not the Edit/Write tools), so the sanctioned path never trips
// this hook.
//
// It inspects the RECONSTRUCTED post-edit file (not just the edit fragment), so
// a value-only edit (old_string "review" -> new_string "approved") is caught,
// and the filename match is case-insensitive.
//
// This is NOT a complete runtime gate: Bash writes (sed/tee/redirect), file
// renames, and MCP/remote writers are out of a PreToolUse matcher's reach. The
// load-bearing, non-bypassable gate is `npm run harness:check` run in CI (see
// harness/protocols/submodule-attach.md). Wire it in .claude/settings.json:
//   { "hooks": { "PreToolUse": [ { "matcher": "Edit|Write|MultiEdit",
//       "hooks": [ { "type": "command",
//         "command": "node .harness/scripts/harness/claude-approval-guard.mjs" } ] } ] } }
//
// Contract: reads the PreToolUse JSON on stdin; exit 2 + stderr blocks the call
// (works even under bypassPermissions). Any parse/read error fails open (exit 0)
// so a hook bug never wedges normal editing — harness:check remains the backstop.
import fs from "node:fs";
import path from "node:path";
import { isPreAdrStage, parseFrontmatter } from "./lib.mjs";

const STATUS_FLIP_RE = /^\s*status:\s*["']?(approved|accepted)\b/m;
const APPROVAL_LINE_RE = /^\s*-\s*APPROVAL\s+(prd|adr)\b/m;
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

function readCurrent(cwd, filePath) {
  try {
    return fs.readFileSync(path.resolve(cwd, filePath), "utf8");
  } catch {
    return null; // new file (Write) or unreadable; reconstruct falls back below
  }
}

// Best-effort reconstruction of the post-edit content. Literal (non-regex)
// replacement, and applies to all occurrences so detection over-approximates
// rather than misses. Falls back to the raw fragments when the current file is
// unavailable, so a value-only Edit is still caught whenever the file exists.
function reconstruct(payload, toolInput, currentContent) {
  if (payload.tool_name === "Write") {
    return typeof toolInput.content === "string" ? toolInput.content : currentContent ?? "";
  }
  if (payload.tool_name === "MultiEdit" && Array.isArray(toolInput.edits)) {
    let text = currentContent;
    if (text === null) return toolInput.edits.map((edit) => String(edit?.new_string ?? "")).join("\n");
    for (const edit of toolInput.edits) {
      if (edit && typeof edit.old_string === "string" && typeof edit.new_string === "string") {
        text = text.split(edit.old_string).join(edit.new_string);
      }
    }
    return text;
  }
  // Edit
  const oldStr = typeof toolInput.old_string === "string" ? toolInput.old_string : "";
  const newStr = typeof toolInput.new_string === "string" ? toolInput.new_string : "";
  if (currentContent === null) return newStr; // fragment fallback
  return oldStr ? currentContent.split(oldStr).join(newStr) : `${currentContent}\n${newStr}`;
}

function violation(base, currentContent, nextContent, toolInput) {
  const next = parseFrontmatter(nextContent) ?? {};
  const cur = currentContent !== null ? (parseFrontmatter(currentContent) ?? {}) : {};

  if (base === "prd.md" || base === "adr.md") {
    // Only a NEWLY introduced approval flip is blocked; editing the body of an
    // already-approved artifact is fine.
    if ((next.status === "approved" || next.status === "accepted") && next.status !== cur.status) {
      return `status를 "${next.status}"로 전환하려고 합니다`;
    }
    // Fragment fallback (file could not be reconstructed): scan raw fragments.
    if (currentContent === null && fragmentsFlip(toolInput)) {
      return "status를 approved/accepted로 전환하려고 합니다";
    }
    return null;
  }

  // state.md — approval axis only, and only when newly introduced. Stage
  // progression (e.g. approved -> implementing) stays allowed; recording the
  // approval evidence is approve.mjs's exclusive domain.
  if (next.prd_status === "approved" && cur.prd_status !== "approved") {
    return "prd_status를 approved로 바꾸려고 합니다 (approve.mjs 전용)";
  }
  if (next.adr_status === "accepted" && cur.adr_status !== "accepted") {
    return "adr_status를 accepted로 바꾸려고 합니다 (approve.mjs 전용)";
  }
  const hadApproval = currentContent !== null && APPROVAL_LINE_RE.test(currentContent);
  if (!hadApproval && APPROVAL_LINE_RE.test(nextContent)) {
    return "승인 이벤트(- APPROVAL ...)를 직접 추가하려고 합니다 (approve.mjs 전용)";
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
