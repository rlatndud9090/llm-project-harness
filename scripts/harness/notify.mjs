#!/usr/bin/env node
// Plugin Notification hook (llm-project-harness).
//
// background/agents 세션이 사용자 입력 대기(agent_needs_input)로 전환되거나 완료·실패
// (agent_completed)로 끝날 때 터미널 벨(BEL, U+0007)을 울린다. OS 데스크톱 알림이 안 뜨는
// 멀티플렉서(cmux 등) 안에서도 세션 상태 변화를 소리/시각벨로 알아채게 하는 것이 목적이다.
//
// Notification 훅은 stdout과 exit code를 무시하고 terminalSequence 출력 필드만 존중한다
// (공식 hooks 레퍼런스). 그래서 BEL 을 그 필드로 반환한다 — Claude Code 가 이 시퀀스를
// 터미널에 직접 쓴다. 실제로 소리/시각벨이 나는지는 사용자 터미널·멀티플렉서의 벨 설정
// 소관이고, 이 두 matcher 는 agent view 가 열려 있을 때만 발화한다. 어느 쪽도 이 훅이
// 보장하지 않는다 — 훅은 지원되는 신호를 보낼 뿐이다.
//
// session-start 와 같은 .harness.json 게이트: 하네스를 채택한 소비 레포 세션에서만 운다.
// 어떤 오류도 세션을 막지 않도록 항상 exit 0 (fail open).
import fs from "node:fs";
import path from "node:path";

try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (fs.existsSync(path.join(projectDir, ".harness.json"))) {
    process.stdout.write(JSON.stringify({ terminalSequence: "\u0007" }));
  }
} catch {
  // fail open: 훅 버그로 세션을 막지 않는다
}
process.exit(0);
