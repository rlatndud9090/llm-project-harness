#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The harness artifact check ships in the plugin, so a consuming project has no
// `harness:check` npm script to run. Resolve the sibling engine script and invoke
// it directly (cwd = the repo under test decides provider vs consumer mode). The
// other steps (lint/build/test:run) remain the consumer's own package scripts.
const ARTIFACT_CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifact-check.mjs");

// Windows에서 `npm`은 실행 파일이 아니라 `npm.cmd` 셸 래퍼다. Node 18.20.2 /
// 20.12.2 / 21.7.3에서 CVE-2024-27980 대응으로 `.cmd`·`.bat`의 암묵적 실행이
// 막히면서, shell 없이 도는 spawnSync는 두 이름 다 실패한다(Node 22.12.0 실측).
//   spawnSync("npm", …)     -> error ENOENT (확장자 없는 npm은 PATH에 없다)
//   spawnSync("npm.cmd", …) -> error EINVAL (shell 없이는 .cmd를 띄우지 못한다)
// 그래서 "npm.cmd로 바꾸면 된다"는 흔한 처방은 최신 Node에서 통하지 않는다.
//
// 1순위는 이 프로세스를 띄운 패키지 매니저의 JS 진입점을 node로 직접 도는 것이다.
// `npm run harness:gate`로 들어오면 npm이 npm_execpath로 그 경로를 넘겨주고,
// pnpm·yarn도 같은 변수를 세우므로 소비 프로젝트가 쓰는 매니저를 그대로 따라간다.
// 변수가 없을 때(= gate.mjs를 node로 직접 실행)만 Windows에서 shell을 경유한다.
// 스텝 인자는 전부 고정 리터럴이라 shell 파싱으로 인한 위험이 없다.
const packageManagerCli = resolvePackageManagerCli();

// 성공한 스텝의 로그는 판정에 기여하지 않으면서 에이전트 컨텍스트로 그대로 흘러들어
// 게이트 1회당 수 KB를 태운다. 그래서 모든 스텝을 캡처해 성공 시 `<step> ok` 한 줄로
// 요약하고(test:run은 Tests 요약 라인만 표면화), 실패한 스텝만 전문을 낸다 — 실패
// 디버깅 근거는 종전과 동일하다. 전체 출력이 필요하면 HARNESS_GATE_VERBOSE=1 또는
// --verbose로 강제한다(캡처 후 일괄 출력이라 실시간 스트리밍은 아니다).
const verbose = process.env.HARNESS_GATE_VERBOSE === "1" || process.argv.includes("--verbose");

const maxBuffer = Number(process.env.HARNESS_GATE_MAX_BUFFER) || 64 * 1024 * 1024;

const steps = ["harness:check", "lint", "build", "test:run"];

// process.exit()는 pending stdio를 flush하지 않아, 방금 write한 실패 전문 덤프가
// 잘린 채 종료될 수 있다(Node 공식 문서 경고). exitCode만 세우고 자연 종료한다.
process.exitCode = runGateSteps();

function runGateSteps() {
  for (const script of steps) {
    console.log(`[harness:gate] ${script === "harness:check" ? "artifact-check" : `npm run ${script}`}`);

    const result = runScript(script, { encoding: "utf8", maxBuffer });

    // spawn 자체가 실패하면 status가 null로 온다. 그대로 exit 1 하면 "check가
    // 실패했다"로 오독되므로(원인 메시지가 한 줄도 안 나온다), 실행 실패와 스텝
    // 실패를 갈라서 보고한다. ENOBUFS는 셋 중 어느 쪽도 아니다 — 스텝은 돌았는데
    // 출력이 캡처 한도를 넘은 것이므로, "npm PATH" 처방으로 오진하지 않는다.
    if (result.error) {
      if (result.error.code === "ENOBUFS") {
        process.stdout.write(result.stdout ?? "");
        process.stderr.write(result.stderr ?? "");
        console.error(`[harness:gate] "npm run ${script}" 출력이 캡처 한도(maxBuffer)를 넘어 잘렸습니다. 위는 부분 출력입니다 — 스텝을 직접 실행해 전체 출력을 확인하세요.`);
        return 1;
      }
      console.error(`[harness:gate] failed to run "npm run ${script}": ${result.error.code ?? result.error.message}`);
      console.error(`[harness:gate] platform=${process.platform} node=${process.version} npm_execpath=${process.env.npm_execpath ?? "(unset)"}`);
      console.error(`[harness:gate] 패키지 매니저를 실행하지 못했습니다. \`npm run harness:gate\`로 실행하거나 npm이 PATH에 있는지 확인하세요.`);
      return 1;
    }

    const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    if (result.status !== 0 || verbose) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }

    if (result.status !== 0) {
      return result.status ?? 1;
    }

    if (script === "test:run") {
      // 테스트 스텝만은 "몇 개가 돌았는가"가 보고·Tested: trailer의 근거라 요약
      // 라인(vitest `Tests`/`Test Files`, jest `Tests:`)을 성공 시에도 표면화한다.
      for (const line of testSummaryLines(combinedOutput)) {
        console.log(`[harness:gate] ${line}`);
      }

      // The test step runs with --passWithNoTests, so a project with zero tests
      // exits 0 and looks identical to a real pass. Surface a WARNING when no
      // tests were collected, and require the report to disclose it.
      if (/no test files found/i.test(combinedOutput)) {
        console.log(
          "[harness:gate] WARNING: no tests collected (test:run passed via --passWithNoTests). Disclose this in the report and the commit Not-tested: trailer.",
        );
      }
    }

    console.log(`[harness:gate] ${script} ok`);
  }

  console.log("[harness:gate] ok");
  return 0;
}

function testSummaryLines(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => /^\s*(Test Files|Tests)\s{2,}/.test(line) || /^Tests:/.test(line))
    .slice(-2)
    .map((line) => line.trim());
}

function runScript(script, options) {
  // harness:check has no consumer npm script — run the plugin's engine directly.
  if (script === "harness:check") {
    return spawnSync(process.execPath, [ARTIFACT_CHECK], options);
  }
  if (packageManagerCli) {
    return spawnSync(process.execPath, [packageManagerCli, "run", script], options);
  }
  return spawnSync("npm", ["run", script], { ...options, shell: process.platform === "win32" });
}

// npm·pnpm·yarn은 npm_execpath에 JS 진입점을 넘긴다. 드물게 `.cmd` 래퍼가 들어오는
// 환경이 있는데 그건 node로 직접 못 돌리므로, 실제 존재하는 JS일 때만 채택하고
// 아니면 shell 경유 fallback으로 넘긴다.
function resolvePackageManagerCli() {
  const execPath = process.env.npm_execpath;
  if (!execPath || !/\.[cm]?js$/i.test(execPath)) return null;
  return fs.existsSync(execPath) ? execPath : null;
}
