#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_BRANCHES,
  createAndCheckoutBranch,
  fail,
  getCurrentBranch,
  harnessPath,
  inferRawUnitFromBranch,
  isGitRepo,
  localBranchExists,
  parseArgs,
  pathExists,
  rawUnitPath,
  readText,
  repoPath,
  setFrontmatterField,
  titleFromSlug,
  today,
  validateTypeAndSlug,
  workingTreeChangedPaths,
  writeText,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const branchInfo = inferRawUnitFromBranch();

let type = args.type;
let slug = args.slug;

if ((!type || !slug) && branchInfo.parsed) {
  type = branchInfo.parsed.type;
  slug = branchInfo.parsed.slug;
}

if (!type || !slug) {
  fail("cannot infer raw unit on this branch; pass --type <feature|bugfix|chore> --slug <kebab-case>");
}

validateTypeAndSlug(type, slug);

const title = args.title || titleFromSlug(slug);
const date = args.date || today();
const unitDir = rawUnitPath(type, slug);
const branchName = `${type}/${slug}`;
const rawPath = `docs/raw/${type}/${slug}`;

// ─── 브랜치 처리 (상황감지) ──────────────────────────────────────────────────
// raw 골격을 만들기 전에 작업 브랜치를 정리한다. 전역 git 상태를 바꾸는 자동
// 전환은 "main/master + clean"이라는 안전한 경우로만 제한한다. 단, "clean" 판정은
// kickoff 자신의 산출물 — $next-feature가 남긴 `docs/raw/.next-unit` 앵커(이번에
// 소비한다)와 대상 unit의 raw 디렉터리(이번에 만든다/재실행 잔재) — 은 dirty로 세지
// 않는다. 이 자기 산출물을 dirty로 오인하면 next-feature→kickoff 정상 플로우에서
// 앵커 하나 때문에 auto-checkout이 막히고 골격 생성까지 블록되기 때문이다. 그 외
// (무관한 WIP·다른 작업 브랜치·detached·비-git)는 브랜치를 건드리지 않고 힌트만
// 남겨, 워크트리 격리 vs 현재 위치 checkout 선택을 호출자(에이전트/사용자)에게 맡긴다.
// --checkout은 현재 위치에서 강제 생성, --no-branch는 브랜치 로직을 완전히 끈다(충돌 시 우선).
const branchNote = resolveBranch();

// main/master 자동 전환용 clean 판정. kickoff 자신의 산출물만 남은 트리는 "clean"으로
// 본다: 소비할 `.next-unit` 앵커와, (재실행 시) 대상 unit의 raw 디렉터리. 무관한 변경이
// 하나라도 섞여 있으면 dirty로 남아 호출자에게 워크트리 vs checkout 선택을 넘긴다.
// git 오류(null)는 안전하게 dirty로 읽는다.
function treeCleanForKickoff() {
  const changed = workingTreeChangedPaths();
  if (changed === null) return false;
  return changed.every((entry) => {
    const p = entry.replace(/\/$/, "");
    return p === "docs/raw/.next-unit" || p === rawPath || p.startsWith(`${rawPath}/`);
  });
}

function resolveBranch() {
  if (args["no-branch"]) return "브랜치 로직 건너뜀 (--no-branch)";
  if (!isGitRepo()) {
    return args.checkout ? "git 저장소가 아니라 --checkout 무시" : null;
  }

  const current = getCurrentBranch();

  // 이미 이 유닛의 작업 브랜치 위 → branch-first, 그대로 둔다.
  if (current === branchName) return `이미 ${branchName} 위 (그대로 둠)`;

  // 목표 브랜치가 이미 있으면 `checkout -b`는 실패한다. 자동 전환 대신 힌트만.
  if (localBranchExists(branchName)) {
    console.warn(`[kickoff] 브랜치 ${branchName}이(가) 이미 있습니다. 그 브랜치로 옮기려면 "git checkout ${branchName}"를 직접 실행하세요.`);
    return `${branchName} 이미 존재 (전환 안 함)`;
  }

  // --checkout: 현재 위치에서 강제로 새 브랜치 생성.
  if (args.checkout) {
    try {
      createAndCheckoutBranch(branchName);
      return `${branchName} 생성·전환 (--checkout)`;
    } catch {
      fail(`--checkout으로 ${branchName}을(를) 만들 수 없습니다(트리 상태를 확인하세요).`);
    }
  }

  // 자동: main/master + clean 일 때만. 그 외는 건드리지 않고 상황을 알린다.
  const onBase = BASE_BRANCHES.has(current);
  if (onBase && treeCleanForKickoff()) {
    try {
      createAndCheckoutBranch(branchName);
      return `${branchName} 자동 생성·전환 (main+clean)`;
    } catch {
      console.warn(`[kickoff] ${branchName} 자동 생성에 실패했습니다. 수동으로 "git checkout -b ${branchName}"를 실행하세요.`);
      return `${branchName} 자동 생성 실패`;
    }
  }

  if (current === "HEAD") {
    console.warn("[kickoff] detached HEAD 상태라 브랜치를 만들지 않습니다. 작업 브랜치를 정한 뒤 다시 실행하거나 --checkout을 쓰세요.");
  } else if (onBase) {
    console.warn(`[kickoff] 작업 트리에 커밋 안 된 변경이 있어 자동 브랜치 생성을 건너뜁니다. 정리 후 다시 실행하거나 --checkout(현재 위치 생성)/워크트리 격리를 선택하세요.`);
  } else {
    console.warn(`[kickoff] 다른 브랜치(${current})에서 실행 중입니다. 자동 전환하지 않습니다. 워크트리로 격리할지, --checkout으로 ${branchName}을(를) 만들지 선택하세요.`);
  }
  return `브랜치 미변경 (현재 ${current})`;
}

const replacements = [
  [/\{제목\}/g, title],
  [/\{YYYY-MM-DD\}/g, date],
  [/\{slug\}/g, slug],
  [/\{branch\}/g, branchName],
  [/\{raw_path\}/g, rawPath],
  [/Feature title/g, title],
  [/Decision title/g, title],
  [/Bugfix title/g, title],
  [/Chore title/g, title],
  [/Unit title/g, title],
  [/기능 제목/g, title],
  [/결정 제목/g, title],
  [/버그 수정 제목/g, title],
  [/정리 작업 제목/g, title],
  [/작업 단위 제목/g, title],
  [/YYYY-MM-DD/g, date],
  [/unit_type: feature/g, `unit_type: ${type}`],
  [/Unit type: feature \| bugfix \| chore/g, `Unit type: ${type}`],
];

function materialize(templateName, outputName) {
  const templatePath = harnessPath("harness", "templates", "raw", templateName);
  const outputPath = path.join(unitDir, outputName);
  if (pathExists(outputPath)) return false;

  let content = readText(templatePath);
  for (const [pattern, value] of replacements) {
    content = content.replace(pattern, value);
  }

  writeText(outputPath, content);
  return true;
}

// Every unit gets a state.md checkpoint ledger. Feature units use the full
// template (it carries the PRD/ADR approval gate); bugfix/chore units get a
// lean ledger since their statuses do not require user approval.
function materializeStateLedger() {
  const outputPath = path.join(unitDir, "state.md");
  if (pathExists(outputPath)) return false;

  if (type === "feature") {
    let content = readText(harnessPath("harness", "templates", "raw", "state.md"));
    for (const [pattern, value] of replacements) {
      content = content.replace(pattern, value);
    }
    writeText(outputPath, content);
    return true;
  }

  writeText(
    outputPath,
    `---
title: "${title}"
date: "${date}"
stage: kickoff
---

# 작업 단계 원장: ${title}

이 파일은 이 작업 단위의 **단계 체크포인트**다. 새 세션이나 새 에이전트가
작업을 이어받을 때 가장 먼저 이 파일을 읽어 지금 어느 단계인지 판단한다.
단계가 바뀌면 아래 로그에 한 줄 append 하고 \`stage\`를 갱신한다.

## 단계 로그 (append-only)

- ${date} kickoff: raw 골격 생성
`,
  );
  return true;
}

fs.mkdirSync(unitDir, { recursive: true });

const created = [];
if (type === "feature") {
  if (materialize("feature-prd.md", "prd.md")) created.push("prd.md");
  if (materialize("feature-adr.md", "adr.md")) created.push("adr.md");
  if (materialize("notes.md", "notes.md")) created.push("notes.md");
} else if (type === "bugfix") {
  if (materialize("bugfix.md", "bugfix.md")) created.push("bugfix.md");
  if (materialize("notes.md", "notes.md")) created.push("notes.md");
} else {
  if (materialize("chore.md", "notes.md")) created.push("notes.md");
}
if (materializeStateLedger()) created.push("state.md");

// Reconcile against the unit next-feature recorded, then consume the anchor.
// A mismatch means the chosen unit drifted between recommendation and kickoff.
const anchorPath = repoPath("docs", "raw", ".next-unit");
let anchorArea = "";
let anchorSection = "";
if (pathExists(anchorPath)) {
  const anchorParts = (readText(anchorPath).trim().split("\n")[0] ?? "").split("|").map((part) => part.trim());
  const anchorUnit = anchorParts[0] ?? "";
  anchorArea = anchorParts[2] ?? "";
  anchorSection = anchorParts[3] ?? "";
  const resolvedUnit = `${type}/${slug}`;
  if (anchorUnit && anchorUnit !== resolvedUnit) {
    console.warn(`[kickoff] WARNING: next-feature anchor (${anchorUnit}) != resolved unit (${resolvedUnit}); confirm this is intended`);
  }
  fs.rmSync(anchorPath, { force: true });
}

const primaryArtifact = type === "feature" ? "prd.md" : type === "bugfix" ? "bugfix.md" : null;

// Seed the unit's section from --section (preferred) or the next-feature anchor's
// 4th field, then the area from --area (preferred) or the anchor's 3rd field, so
// both durable declarations land in the primary artifact frontmatter.
const section = (typeof args.section === "string" && args.section.trim()) || anchorSection;
const area = (typeof args.area === "string" && args.area.trim()) || anchorArea;
let seededSection = "";
let seededArea = "";
if (primaryArtifact) {
  const artifactPath = path.join(unitDir, primaryArtifact);
  if (pathExists(artifactPath)) {
    let content = readText(artifactPath);
    if (section) {
      content = setFrontmatterField(content, "section", `"${section}"`);
      seededSection = section;
    }
    if (area) {
      content = setFrontmatterField(content, "area", `"${area}"`);
      seededArea = area;
    }
    if (section || area) writeText(artifactPath, content);
  }
}

console.log(`[kickoff] ${path.relative(process.cwd(), unitDir)}`);
console.log(`- branch: ${branchNote ?? branchInfo.branch}`);
console.log(`- title: ${title}`);
console.log(`- unit: ${type}/${slug}`);
console.log(`- created: ${created.length ? created.join(", ") : "none (already existed)"}`);
if (seededSection) console.log(`- section: ${seededSection}`);
if (seededArea) console.log(`- area: ${seededArea}`);

// A chore has no review lifecycle and needs no area/section — it lands in the wiki
// operations bucket. Link it right now (best-effort) so a just-kickoff'd chore is
// already navigable and harness:check is green immediately. feature/bugfix defer
// their first ingest to review (2-touch), and the wiki-link gates exempt them until
// then, so only chore needs this eager link.
if (type === "chore" && pathExists(repoPath("docs", "wiki", "index.md"))) {
  const ingestScript = fileURLToPath(new URL("wiki-ingest.mjs", import.meta.url));
  try {
    execFileSync(process.execPath, [ingestScript, rawPath], { cwd: process.cwd(), stdio: "inherit" });
  } catch {
    console.warn(`[kickoff] chore 자동 ingest 실패 — 수동으로 "npm run harness:ingest -- ${rawPath}"를 실행하세요.`);
  }
}
