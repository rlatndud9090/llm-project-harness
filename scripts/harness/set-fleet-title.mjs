#!/usr/bin/env node
// FleetView(agents 화면) 세션 제목 설정 공용 헬퍼.
//
// next-feature/kickoff 스킬 어댑터에 near-verbatim으로 복제돼 있던 ~50줄 bash+python
// 스크립트를 한 곳으로 추출한 것이다. 현재 Claude Code job의 제목을 작업내역 요약(label)
// 그대로 세팅한다. agents/FleetView 세션이 아니면(=job state.json 없음) 조용히 no-op 하고,
// 어떤 오류가 나도 절대 non-zero로 죽지 않는다(호출측 어댑터 흐름을 막지 않기 위해).
//
// 제목엔 프로젝트 약어 prefix를 붙이지 않는다(작업 단계 요약만 남긴다). 이유: (1) 워크트리
// 세션에선 git 루트가 워크트리 폴더라 약어가 브랜치명에서 엉뚱하게 계산됐고, (2) agents
// 화면을 디렉터리별로 정렬하면 어차피 프로젝트가 드러나 prefix가 중복이다.
//
// job 은 **현재 세션이 쓰는 Claude Code 프로필** 디렉터리 아래에 있다(.claude 로 고정이
// 아니다 — 사용자가 .claude-mine 같은 대체 프로필을 쓸 수 있다). 어느 프로필인지는
// resolveJobsDir()가 CLAUDE_JOB_DIR/CLAUDE_CONFIG_DIR 로 판별한다(아래 함수 주석 참고).
//
// 사용:
//   node .harness/scripts/harness/set-fleet-title.mjs --label "next-feature"
//   node .harness/scripts/harness/set-fleet-title.mjs --slug  "do-next-thing"   # → "do next thing"
//
// --label 은 그대로, --slug 은 하이픈을 공백으로 바꿔 작업명으로 쓴다.
//
// Claude Code/FleetView 전용 편의 기능이다.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 이 세션이 실제로 쓰는 Claude Code 프로필의 jobs 디렉터리를 찾는다. 프로필은 .claude 로
// 고정돼 있지 않다 — 사용자가 CLAUDE_CONFIG_DIR 로 대체 프로필(.claude-mine 등)을 쓰면 job
// state.json 도 그 프로필 아래에 산다. 프로필을 .claude 로 하드코딩하면 .claude-mine 세션에서
// 현재 job 을 못 찾아 제목이 조용히 안 바뀐다(이 헬퍼가 고치는 버그). 우선순위:
//   1) CLAUDE_JOB_DIR: 현재 세션 job 디렉터리(<profile>/jobs/<jobId>)를 직접 가리킨다 →
//      그 부모가 곧 이 세션의 jobs 디렉터리다(가장 정확).
//   2) CLAUDE_CONFIG_DIR: 프로필 루트 오버라이드 → 그 아래 jobs.
//   3) 오버라이드가 없으면 기본 프로필 ~/.claude/jobs.
function resolveJobsDir() {
  const jobDir = process.env.CLAUDE_JOB_DIR;
  if (jobDir) return path.dirname(jobDir);
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  if (cfg) return path.join(cfg, "jobs");
  return path.join(os.homedir(), ".claude", "jobs");
}

function main() {
  const argv = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--label" || key === "--slug") {
      flags[key.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }

  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  const jobsDir = resolveJobsDir();

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

  // 제목은 작업내역 요약(label) 그대로. 프로젝트 약어 prefix는 붙이지 않는다(파일 상단 주석 참고).
  const title = label;

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
