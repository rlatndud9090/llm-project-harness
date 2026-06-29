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

const BROAD_FEATURE_CATEGORIES = new Set([
  "Product & Architecture",
  "Architecture",
  "Product",
  "Products",
  "Feature",
  "Features",
  "General",
  "Misc",
  "Miscellaneous",
  "Other",
  "기능",
  "전체 기능",
  "아키텍처",
  "공통",
  "기타",
]);
const OPERATIONS_CATEGORIES = ["프로젝트 운영", "Project Operations"];

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

const categories = listCategories(wiki);
const category = resolveCategory({ type, requested: args.category, categories });

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

function resolveCategory({ type, requested, categories }) {
  if (type === "feature") {
    return resolveFeatureCategory(requested, categories);
  }

  if (requested) return requested.trim();

  const fallbackCategory = categories.find((category) => OPERATIONS_CATEGORIES.includes(category)) ?? OPERATIONS_CATEGORIES[0];
  console.warn(`[wiki-ingest] 분류(--category) 미지정 → fallback "${fallbackCategory}" 사용`);
  if (categories.length) {
    console.warn(`  기존 분류: ${categories.join(", ")}`);
    console.warn(`  더 적합한 분류가 있으면 --category "<이름>"으로 다시 실행하세요.`);
  }
  return fallbackCategory;
}

function resolveFeatureCategory(requested, categories) {
  const featureCategories = categories.filter((category) => !OPERATIONS_CATEGORIES.includes(category));
  if (!requested) {
    const hint = featureCategories.length
      ? ` 현재 세부 카테고리: ${featureCategories.join(", ")}`
      : " docs/wiki/index.md에 세부 카테고리(최소 4개)를 먼저 정의하세요.";
    fail(
      `feature raw unit은 --category가 필수입니다. html-editor-fe처럼 세부 카테고리(예: 텍스트 서식, 블록 구조, 리치 콘텐츠) 중 하나를 명시하세요.${hint}`,
    );
  }

  const category = requested.trim();
  if (BROAD_FEATURE_CATEGORIES.has(category) || OPERATIONS_CATEGORIES.includes(category)) {
    fail(
      `feature category "${category}"는 너무 넓습니다. html-editor-fe 수준의 세부 카테고리로 나누고 --category에 그중 하나를 지정하세요.`,
    );
  }

  if (!categories.includes(category)) {
    fail(
      `feature category "${category}"가 docs/wiki/index.md에 없습니다. 새 세부 카테고리가 필요하면 index.md에 ### ${category} 헤딩을 먼저 추가한 뒤 다시 실행하세요.`,
    );
  }

  return category;
}
