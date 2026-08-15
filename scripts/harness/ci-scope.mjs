#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// CI 변경 스코프 판정기. PR이 도입한 변경이 `docs/` 하위에만 있으면 `check-only`
// (의존성 설치·lint·build·test를 건너뛰고 harness:check만), 그 외에는 `full`이다.
//
// 왜 harness:check는 항상 도는가: 단순 `paths-ignore: docs/**`로 문서 PR을 통째
// 스킵하면 branch↔raw 정합·승인 원장 정합 같은 harness:check의 검사가 함께 누락된다.
// 그래서 스코프를 낮추더라도 harness:check(외부 npm 의존성 없는 순수 node 검사)는
// 반드시 실행하고, 스킵하는 건 코드가 안 바뀐 PR에서 결과가 달라질 수 없는
// lint/build/test뿐이다. 판정 근거가 없거나 애매하면 언제나 `full`로 떨어진다(fail-safe).
//
// action.yml의 스코프 스텝이 이 스크립트를 실행하고, 결과 `mode`를 $GITHUB_OUTPUT에
// 기록하면 이후 스텝의 `if:`가 분기한다.

// 변경 파일 목록 → 모드. 순수함수(테스트가 이것만 import한다).
export function classifyChangeScope(changedFiles) {
  // 빈 목록(diff 실패·변경 없음 등 판정 불가)은 보수적으로 full.
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return "full";
  // 모든 변경 파일이 docs/ 하위면 문서 전용 → check만.
  const allDocs = changedFiles.every((f) => f === "docs" || f.startsWith("docs/"));
  return allDocs ? "check-only" : "full";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = determineMode();
  writeOutput(mode);
  console.log(`[ci-scope] mode=${mode}`);
}

function determineMode() {
  const event = process.env.HARNESS_EVENT_NAME || "";
  const base = process.env.HARNESS_PR_BASE_SHA || "";
  const head = process.env.HARNESS_PR_HEAD_SHA || "";

  // PR 이벤트가 아니면(push 등) 스코프를 좁힐 근거가 없다 — 전량 검증.
  if (event !== "pull_request" && event !== "pull_request_target") return "full";
  if (!base || !head) return "full";

  const files = diffFiles(base, head);
  if (files === null) return "full"; // diff 실패(base sha 미존재 등) → fail-safe
  return classifyChangeScope(files);
}

function diffFiles(base, head) {
  try {
    // three-dot: merge-base(base와 head의 공통조상)부터 head까지 = PR이 도입한 변경.
    // core.quotePath=false: 비-ASCII 경로(예: 한글 wiki 섹션 파일 docs/wiki/<섹션>.md)를
    // `"docs/\355..."`처럼 따옴표+이스케이프로 내보내면 startsWith("docs/")가 깨져 docs-only
    // 최적화를 놓친다(안전엔 무해하나 낭비). 끄면 UTF-8 경로 그대로 나온다.
    const out = execFileSync("git", ["-c", "core.quotePath=false", "diff", "--name-only", `${base}...${head}`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // base sha가 로컬에 없거나(fork·shallow) diff가 실패하면 판정 불가.
    return null;
  }
}

function writeOutput(mode) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) return;
  try {
    fs.appendFileSync(outFile, `mode=${mode}\n`);
  } catch (err) {
    console.error(`[ci-scope] failed to write GITHUB_OUTPUT: ${err.message}`);
  }
}
