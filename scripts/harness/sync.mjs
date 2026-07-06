#!/usr/bin/env node
import {
  changelogEntriesAfter,
  changelogHeadId,
  harnessPath,
  isHarnessRepository,
  parseArgs,
  pathExists,
  readText,
  repoPath,
  writeText,
} from "./lib.mjs";

// Consumer reconciliation command. After updating the `.harness` submodule, a
// consuming project runs this to read the CHANGELOG entries it has not yet
// reconciled (each with a required consumer action), applies them, then re-runs
// with --ack to record the reconciliation. `harness:check` blocks until acked.

const args = parseArgs(process.argv.slice(2));

if (isHarnessRepository()) {
  console.log("[harness:sync] provider 저장소입니다 — 동기화할 소비자 위치가 없습니다.");
  process.exit(0);
}

const changelogPath = harnessPath("CHANGELOG.md");
if (!pathExists(changelogPath)) {
  console.log("[harness:sync] .harness/CHANGELOG.md가 없습니다(구버전 하네스). 동기화할 항목 없음.");
  process.exit(0);
}

const content = readText(changelogPath);
const head = changelogHeadId(content);
if (!head) {
  console.log("[harness:sync] CHANGELOG에 항목이 없습니다.");
  process.exit(0);
}

const syncPath = repoPath(".harness-sync");
const acked = pathExists(syncPath) ? readText(syncPath).trim() : "";

if (acked === head) {
  console.log(`[harness:sync] 이미 정합성 맞음 (${head}).`);
  process.exit(0);
}

console.log(`[harness:sync] 반영 필요한 CHANGELOG 항목 (현재 "${acked || "(없음)"}" → head "${head}"):\n`);
console.log(changelogEntriesAfter(content, acked));
console.log("");

if (args.ack) {
  writeText(syncPath, `${head}\n`);
  console.log(`[harness:sync] 위 항목의 소비자 조치를 반영했다고 확인합니다. .harness-sync → ${head}`);
} else {
  console.log("[harness:sync] 위 소비자 조치를 반영한 뒤 `npm run harness:sync --ack`로 확인하세요. 확인 전에는 harness:check가 막습니다.");
}
