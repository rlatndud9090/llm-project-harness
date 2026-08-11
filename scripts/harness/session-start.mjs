#!/usr/bin/env node
// Plugin SessionStart hook (llm-project-harness).
//
// Fires at the start of every Claude Code session in which the plugin is
// enabled. It is scoped by the project root flag `.harness.json`: only a repo
// that has adopted the harness (via `/lph-init`, which writes that file)
// gets the harness session-start protocol injected. In any other repo this
// stays completely silent, so a globally-enabled plugin never intrudes on
// projects that do not opt in.
//
// Contract: stdout is added to the session context. Always exit 0 — a
// SessionStart hook must never wedge a session. Any error fails open (silent).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

  // 배선 신선도 넛지. 플러그인(엔진·스킬·훅)은 마켓플레이스로 자동 갱신되지만,
  // /lph-init이 소비 레포에 직접 커밋한 "배선"(git훅의 baked 절대경로·CI 워크플로·
  // .harness.json·settings)은 자동으로 안 바뀐다. 설치된 플러그인 버전이 이 저장소에
  // 마지막으로 새긴 배선 버전(.harness.json version)보다 새로우면, 재실행을 권한다.
  // 재실행하면 flag version이 올라가 넛지가 저절로 사라진다. 로컬 비교라 네트워크 없음.
  const pluginVersion = readPluginVersion();
  if (pluginVersion && typeof flag.version === "string" && isNewerVersion(pluginVersion, flag.version)) {
    lines.push(
      `※ 플러그인이 v${pluginVersion}로 업데이트됐습니다(이 저장소 배선은 v${flag.version}). ` +
        "배선(git훅·CI·.harness.json)이 뒤처졌을 수 있으니 /lph-init을 다시 실행해 갱신하세요(먼저 --dry-run으로 확인).",
    );
  }

  process.stdout.write(lines.join("\n") + "\n");
}

// 이 훅 스크립트는 플러그인 안에 있으므로, 두 단계 위가 플러그인 루트다.
function readPluginVersion() {
  try {
    const manifest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude-plugin", "plugin.json");
    const v = JSON.parse(fs.readFileSync(manifest, "utf8")).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

// 순수 숫자 dotted 버전만 비교한다(2.0.0 > 1.1.0). 파싱 불가(프리릴리스 태그 등)면
// 조용히 비교를 포기해(false) 애매한 넛지를 내지 않는다.
function isNewerVersion(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
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
