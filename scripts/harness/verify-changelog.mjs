#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { REPO_ROOT, isHarnessRepository } from "./lib.mjs";

// Provider-repo pre-commit guard: a commit that changes the shared harness
// surface must also add a CHANGELOG.md entry, so consuming projects always have a
// reconciliation record for the change. No-op in consumer projects (they do not
// author the harness changelog) and when no shared surface is staged.

if (!isHarnessRepository()) process.exit(0);

let staged;
try {
  staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
} catch {
  process.exit(0); // not a git repo, or nothing staged
}

const SHARED_SURFACE = /^(harness\/|scripts\/harness\/|\.claude\/|\.codex\/)/;
const touchesShared = staged.some((file) => SHARED_SURFACE.test(file) && file !== "CHANGELOG.md");
if (!touchesShared) process.exit(0);

if (!staged.includes("CHANGELOG.md")) {
  console.error("[verify-changelog] 공용 하네스 표면(harness/, scripts/harness/, .claude/, .codex/)을 바꾸는 커밋은 CHANGELOG.md 항목이 필요합니다.");
  console.error("[verify-changelog] CHANGELOG.md 맨 위에 `## <YYYY-MM-DD> <slug>` 항목(변경 + 소비자 조치)을 추가하고 stage 하세요.");
  process.exit(1);
}

process.exit(0);
