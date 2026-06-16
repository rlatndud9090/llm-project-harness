#!/usr/bin/env node
import path from "node:path";
import {
  extractH1,
  fail,
  inferRawUnitFromBranch,
  parseArgs,
  pathExists,
  rawUnitPath,
  readText,
  relativeFromWiki,
  repoPath,
  stripKnownPrefix,
  toPosix,
  validateTypeAndSlug,
  writeText,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const positionalPath = args._[0];
let unitDir;

if (positionalPath) {
  unitDir = path.resolve(process.cwd(), positionalPath);
} else {
  const { parsed } = inferRawUnitFromBranch();
  if (!parsed) fail("pass a raw unit path or run from feature/*, bugfix/*, or chore/*");
  unitDir = rawUnitPath(parsed.type, parsed.slug);
}

const relativeUnit = toPosix(path.relative(repoPath("docs", "raw"), unitDir));
const [type, slug] = relativeUnit.split("/");
validateTypeAndSlug(type, slug);

if (!pathExists(unitDir)) {
  fail(`raw unit does not exist: ${toPosix(path.relative(process.cwd(), unitDir))}`);
}

const files = [
  ["PRD", "prd.md"],
  ["ADR", "adr.md"],
  ["Bugfix", "bugfix.md"],
  ["Notes", "notes.md"],
].filter(([, fileName]) => pathExists(path.join(unitDir, fileName)));

if (files.length === 0) {
  fail(`raw unit has no markdown artifact: ${relativeUnit}`);
}

const titleSource = files.find(([, fileName]) => fileName === "prd.md") ?? files[0];
const titleContent = readText(path.join(unitDir, titleSource[1]));
const title = stripKnownPrefix(extractH1(titleContent) ?? slug);
const wikiPath = repoPath("docs", "wiki", "index.md");
let wiki = readText(wikiPath);

const primaryPath = path.join(unitDir, titleSource[1]);
const primaryLink = relativeFromWiki(primaryPath);

if (wiki.includes(`](${primaryLink})`)) {
  console.log(`[wiki-ingest] ${relativeUnit} already linked`);
  process.exit(0);
}

// 분류는 의미 판단이므로 --category로 받는다. 생략하면 type 기반 fallback으로
// 떨어지되, 기존 분류 목록을 노출해 더 적합한 분류로 다시 지정하도록 유도한다.
const fallbackCategory = type === "feature" ? "Product & Architecture" : "Project Operations";
const category = args.category || fallbackCategory;
if (!args.category) {
  console.warn(`[wiki-ingest] 분류(--category) 미지정 → fallback "${fallbackCategory}" 사용`);
  const existing = listCategories(wiki);
  if (existing.length) {
    console.warn(`  기존 분류: ${existing.join(", ")}`);
    console.warn(`  더 적합한 분류가 있으면 --category "<이름>"으로 다시 실행하세요.`);
  }
}

const linkParts = files.map(([label, fileName]) => `[${label}](${relativeFromWiki(path.join(unitDir, fileName))})`);
const line = `- **${title}** — ${linkParts.join(" · ")}`;
const heading = `### ${category}`;
const headingIndex = wiki.indexOf(heading);

if (headingIndex === -1) {
  const rawUnitsIndex = wiki.indexOf("## Maintenance");
  if (rawUnitsIndex === -1) fail("could not find Maintenance section in wiki index");
  wiki = `${wiki.slice(0, rawUnitsIndex).trimEnd()}\n\n${heading}\n\n${line}\n\n${wiki.slice(rawUnitsIndex)}`;
} else {
  const nextHeading = wiki.indexOf("\n### ", headingIndex + heading.length);
  const nextSection = wiki.indexOf("\n## ", headingIndex + heading.length);
  const candidates = [nextHeading, nextSection].filter((index) => index !== -1);
  const insertAt = candidates.length ? Math.min(...candidates) : wiki.length;
  const before = wiki.slice(0, insertAt).trimEnd();
  const after = wiki.slice(insertAt);
  wiki = `${before}\n${line}\n${after}`;
}

writeText(wikiPath, wiki);

console.log(`[wiki-ingest] ${relativeUnit} linked`);
console.log(`- category: ${category}`);
console.log(`- link: ${line}`);

// index의 기존 카테고리(`### ` 헤딩)를 분류 체계로 노출한다. ingest 시 모델이
// 적절한 분류를 고르도록 돕는다.
function listCategories(wiki) {
  const categories = [];
  const re = /^### (.+)$/gm;
  let match;
  while ((match = re.exec(wiki)) !== null) {
    categories.push(match[1].trim());
  }
  return categories;
}
