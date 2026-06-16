#!/usr/bin/env node
import { isHarnessRepository, pathExists, readText } from "./lib.mjs";

// commit-msg 훅이 호출한다(`install-hooks.mjs`가 설치). 커밋 본문에
// commit-protocol의 `관련 문서:` 블록이 있는지 기계강제한다. 구조(블록 + 링크
// 존재)만 강제하고, 어떤 문서를 링크할지(의미)는 모델 재량으로 둔다.
//
// harness provider 저장소 자신은 consumer 워크플로(raw/wiki/PRD/ADR)를 쓰지
// 않으므로 검사를 건너뛴다. artifact-check.mjs의 다른 게이트와 같은 규칙이다.

function reject(message) {
  console.error(`[verify-commit-msg] ${message}`);
  process.exit(1);
}

const messagePath = process.argv[2];
if (!messagePath) reject("commit message file path required");
if (!pathExists(messagePath)) reject(`commit message file not found: ${messagePath}`);

if (isHarnessRepository()) {
  process.exit(0);
}

const raw = readText(messagePath);
// 주석(#) 줄은 커밋 메시지에 포함되지 않으므로 검사에서 제외한다.
const lines = raw.split("\n").filter((line) => !line.startsWith("#"));
const body = lines.join("\n");
const firstLine = lines.find((line) => line.trim().length > 0) ?? "";

// 자동 생성 커밋은 본문 형식을 강제하지 않는다.
if (/^(Merge |Revert |fixup!|squash!|amend!)/.test(firstLine)) {
  process.exit(0);
}

const hasBlock = /관련 문서:/.test(body);
const hasLink = /\]\([^)\s]+\)/.test(body);

if (!hasBlock || !hasLink) {
  console.error("[verify-commit-msg] 커밋 본문에 `관련 문서:` 블록과 raw 링크가 필요합니다.");
  console.error("  예:");
  console.error("    관련 문서:");
  console.error("    [PRD](docs/raw/<type>/<slug>/prd.md)");
  console.error("    [ADR](docs/raw/<type>/<slug>/adr.md)");
  console.error("  notes-only 변경도 [Notes](docs/raw/<type>/<slug>/notes.md) 링크를 둡니다.");
  console.error("  공용 기준: .harness/harness/protocols/commit-protocol.md");
  process.exit(1);
}
