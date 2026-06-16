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
