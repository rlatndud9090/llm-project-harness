#!/usr/bin/env node
// FleetView(agents 화면) 세션 제목 설정 공용 헬퍼.
//
// next-feature/kickoff 스킬 어댑터에 near-verbatim으로 복제돼 있던 ~50줄 bash+python
// 스크립트를 한 곳으로 추출한 것이다. 현재 Claude Code job의 제목을 "<ABBR> <label>"로
// 바꾼다. agents/FleetView 세션이 아니면(=job state.json 없음) 조용히 no-op 하고, 어떤
// 오류가 나도 절대 non-zero로 죽지 않는다(호출측 어댑터 흐름을 막지 않기 위해).
//
// 사용:
//   node .harness/scripts/harness/set-fleet-title.mjs --label "next-feature"
//   node .harness/scripts/harness/set-fleet-title.mjs --slug  "do-next-thing"   # → "do next thing"
//   node .harness/scripts/harness/set-fleet-title.mjs --slug  "x" --abbr "PBQ"  # 약어 수동 지정
//
// --label 은 그대로, --slug 은 하이픈을 공백으로 바꿔 작업명으로 쓴다. --abbr 를 주면
// 자동 계산 약어를 덮어쓴다(약어가 어색할 때 사람이 읽기 좋은 2~4글자로).
//
// Claude/FleetView 전용 편의 기능이므로 Codex 어댑터에는 대응 블록이 없다(parity 무관).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function main() {
  const argv = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--label" || key === "--slug" || key === "--abbr") {
      flags[key.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }

  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  const jobsDir = path.join(os.homedir(), ".claude", "jobs");

  // 가드: agents(FleetView) 세션에서만 동작한다. 세션 id가 없거나 jobs 디렉터리 자체가
  // 없으면 agents 모드가 아니므로 조용히 넘어간다.
  if (!sid || !fs.existsSync(jobsDir)) {
    console.log("agents 세션 아님(job 없음) — 제목 설정 건너뜀");
    return;
  }

  // 라벨: --label 우선, 없으면 --slug 의 하이픈을 공백으로.
  let label = flags.label;
  if (!label && flags.slug) label = flags.slug.replace(/-/g, " ");
  if (!label) {
    console.log("라벨 없음(--label 또는 --slug 필요) — 제목 설정 건너뜀");
    return;
  }

  // 약어: --abbr 우선, 없으면 git 루트 폴더명에서 자동 계산.
  let abbr = flags.abbr;
  if (!abbr) {
    let proj;
    try {
      proj = path.basename(
        execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(),
      );
    } catch {
      proj = path.basename(process.cwd());
    }
    abbr = proj
      .split(/[-_ ]+/)
      .filter(Boolean)
      .map((token) => token[0].toUpperCase())
      .join("");
    if (abbr.length < 2) abbr = proj.slice(0, 3).toUpperCase();
  }

  const title = `<${abbr}> ${label}`;

  // 현재 세션에 해당하는 job의 state.json 을 찾아 name/nameSource 를 세팅한다.
  // nameSource="user" 여야 Claude Code 자동 영문 이름이 덮어쓰지 않는다.
  let entries;
  try {
    entries = fs.readdirSync(jobsDir, { withFileTypes: true });
  } catch {
    console.log("jobs 디렉터리 읽기 실패 — 제목 설정 건너뜀");
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const statePath = path.join(jobsDir, entry.name, "state.json");
    let data;
    try {
      data = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      continue;
    }
    if (data.sessionId === sid || data.resumeSessionId === sid) {
      data.name = title;
      data.nameSource = "user";
      try {
        fs.writeFileSync(statePath, `${JSON.stringify(data, null, 2)}\n`);
        console.log("agents 화면 제목 설정:", title);
      } catch {
        console.log("state.json 쓰기 실패 — 제목 설정 건너뜀");
      }
      return;
    }
  }

  console.log(`이 세션에 해당하는 job 없음(sessionId=${sid}) — 제목 설정 건너뜀`);
}

// 어떤 예외도 어댑터 흐름을 막지 않도록 항상 exit 0.
try {
  main();
} catch (err) {
  console.log("set-fleet-title no-op:", err && err.message ? err.message : String(err));
}
