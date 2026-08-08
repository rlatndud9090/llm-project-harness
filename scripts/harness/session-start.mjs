#!/usr/bin/env node
// Plugin SessionStart hook (llm-project-harness).
//
// Fires at the start of every Claude Code session in which the plugin is
// enabled. It is scoped by the project root flag `.harness.json`: only a repo
// that has adopted the harness (via `/harness-init`, which writes that file)
// gets the harness session-start protocol injected. In any other repo this
// stays completely silent, so a globally-enabled plugin never intrudes on
// projects that do not opt in.
//
// Contract: stdout is added to the session context. Always exit 0 — a
// SessionStart hook must never wedge a session. Any error fails open (silent).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

try {
  main();
} catch {
  // fail open: never block or noise a session on a hook bug
}
process.exit(0);

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const flagPath = path.join(projectDir, ".harness.json");
  if (!fs.existsSync(flagPath)) return; // not a harness project — stay silent

  let flag = {};
  try {
    flag = JSON.parse(fs.readFileSync(flagPath, "utf8"));
  } catch {
    // malformed flag: still announce harness mode, just without version detail
  }
  const version = typeof flag.version === "string" ? ` v${flag.version}` : "";

  const branch = currentBranch(projectDir);
  const workUnit = branch && /^(feature|bugfix|chore)\//.test(branch)
    ? `docs/raw/${branch}/`
    : null;

  const lines = [
    `이 저장소는 LLM Project Harness${version}를 적극 활용합니다 (.harness.json 감지).`,
    "세션 시작 순서를 따르세요:",
    "1. AGENTS.md",
    "2. docs/wiki/index.md (현재 프로젝트 방향)",
  ];
  if (workUnit) {
    lines.push(
      `3. 현재 브랜치 ${branch} → ${workUnit} 의 state.md를 가장 먼저 읽어 stage·승인 여부를 확인`,
      "4. 필요한 만큼만 prd.md / adr.md / notes.md",
    );
  } else {
    lines.push(
      "3. 브랜치가 main이면 wiki index에서 관련 raw link만 따라가기",
    );
  }
  lines.push(
    "열린 요청은 /llm-project-harness:next-feature, 확정 작업은 /llm-project-harness:kickoff → prd-helper,",
    "사전 승인된 구현은 feature-develop, PR 차례면 make-pr로 진입합니다.",
  );

  process.stdout.write(lines.join("\n") + "\n");
}

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
