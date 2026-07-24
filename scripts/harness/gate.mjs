#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";

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

const steps = ["harness:check", "lint", "build", "test:run"];

for (const script of steps) {
  console.log(`[harness:gate] npm run ${script}`);

  // The test step runs with --passWithNoTests, so a project with zero tests
  // exits 0 and looks identical to a real pass. Capture its output, surface a
  // WARNING when no tests were collected, and require the report to disclose it.
  const captureOutput = script === "test:run";
  const result = runScript(script, captureOutput ? { encoding: "utf8" } : { stdio: "inherit" });

  // spawn 자체가 실패하면 status가 null로 온다. 그대로 exit 1 하면 "check가
  // 실패했다"로 오독되므로(원인 메시지가 한 줄도 안 나온다), 실행 실패와 스텝
  // 실패를 갈라서 보고한다.
  if (result.error) {
    console.error(`[harness:gate] failed to run "npm run ${script}": ${result.error.code ?? result.error.message}`);
    console.error(`[harness:gate] platform=${process.platform} node=${process.version} npm_execpath=${process.env.npm_execpath ?? "(unset)"}`);
    console.error(`[harness:gate] 패키지 매니저를 실행하지 못했습니다. \`npm run harness:gate\`로 실행하거나 npm이 PATH에 있는지 확인하세요.`);
    process.exit(1);
  }

  if (captureOutput) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (captureOutput && /no test files found/i.test(`${result.stdout ?? ""}${result.stderr ?? ""}`)) {
    console.log(
      "[harness:gate] WARNING: no tests collected (test:run passed via --passWithNoTests). Disclose this in the report and the commit Not-tested: trailer.",
    );
  }
}

console.log("[harness:gate] ok");

function runScript(script, options) {
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
