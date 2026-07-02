#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  fail,
  harnessPath,
  inferRawUnitFromBranch,
  parseArgs,
  pathExists,
  rawUnitPath,
  readText,
  repoPath,
  titleFromSlug,
  today,
  validateTypeAndSlug,
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

- ${date} kickoff: 브랜치와 raw 골격 생성
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
if (pathExists(anchorPath)) {
  const anchorUnit = (readText(anchorPath).trim().split("\n")[0] ?? "").split("|")[0].trim();
  const resolvedUnit = `${type}/${slug}`;
  if (anchorUnit && anchorUnit !== resolvedUnit) {
    console.warn(`[kickoff] WARNING: next-feature anchor (${anchorUnit}) != resolved unit (${resolvedUnit}); confirm this is intended`);
  }
  fs.rmSync(anchorPath, { force: true });
}

console.log(`[kickoff] ${path.relative(process.cwd(), unitDir)}`);
console.log(`- branch: ${branchInfo.branch}`);
console.log(`- title: ${title}`);
console.log(`- unit: ${type}/${slug}`);
console.log(`- created: ${created.length ? created.join(", ") : "none (already existed)"}`);
