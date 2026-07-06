#!/usr/bin/env node
import path from "node:path";
import {
  BROAD_FEATURE_CATEGORIES,
  CURRENT_MARKER,
  OPERATIONS_CATEGORIES,
  datedBulletDate,
  extractH1,
  fail,
  inferRawUnitFromBranch,
  parseArgs,
  parseAreaList,
  parseFrontmatter,
  pathExists,
  rawUnitPath,
  readText,
  relativeFromWiki,
  repoPath,
  stripKnownPrefix,
  toPosix,
  today,
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

// The primary artifact (prd.md for a feature, else the first present file) is the
// title and date source; the wiki bullet's date prefix is derived from it so the
// timeline is machine-checkable against the durable frontmatter.
const titleSource = files.find(([, fileName]) => fileName === "prd.md") ?? files[0];
const titleContent = readText(path.join(unitDir, titleSource[1]));
const title = stripKnownPrefix(extractH1(titleContent) ?? slug);
const unitDate = parseFrontmatter(titleContent)?.date ?? today();

const wikiPath = repoPath("docs", "wiki", "index.md");
let wiki = readText(wikiPath);

const primaryLink = relativeFromWiki(path.join(unitDir, titleSource[1]));
const linkParts = files.map(([label, fileName]) => `[${label}](${relativeFromWiki(path.join(unitDir, fileName))})`);
const line = `- \`${unitDate}\` **${title}** — ${linkParts.join(" · ")}`;

// Legacy safety valve: an already-linked unit with no area signal at all (no
// --area, no --category, no frontmatter area) is a pre-area unit being re-ingested.
// Treat it as a no-op instead of failing the "feature needs an area" guard, so an
// old `harness:ingest -- <path>` call keeps working on a legacy consumer.
const hasAreaSignal =
  (typeof args.area === "string" && parseAreaList(args.area).length > 0) ||
  (typeof args.category === "string" && args.category.trim().length > 0) ||
  parseAreaList(parseFrontmatter(titleContent)?.area).length > 0;
if (!hasAreaSignal && wiki.includes(`](${primaryLink})`)) {
  console.log(`[wiki-ingest] ${relativeUnit} already linked (area 미선언 레거시 unit — 그대로 둡니다)`);
  process.exit(0);
}

const areas = resolveAreas();

// Existing area headings (captured before insertion) power a duplicate nudge:
// creating a NEW feature area while other areas already exist is the moment a
// typo (`A화면` vs `A 화면`) silently forks a lineage, which no gate catches.
const existingHeadings = [...wiki.matchAll(/^### (.+)$/gm)].map((match) => match[1].trim());

const linked = [];
const already = [];
const reconciled = [];
for (const area of areas) {
  const result = upsertAreaLink(wiki, area);
  wiki = result.wiki;
  if (result.reconciled) reconciled.push(area);
  else if (result.inserted) linked.push(area);
  else already.push(area);
}

writeText(wikiPath, wiki);

const existingAreas = existingHeadings.filter((heading) => !OPERATIONS_CATEGORIES.includes(heading));
const newAreas = areas.filter((area) => !existingHeadings.includes(area) && !OPERATIONS_CATEGORIES.includes(area));
if (newAreas.length && existingAreas.length) {
  console.warn(`[wiki-ingest] 새 영역 생성: ${newAreas.join(", ")}`);
  console.warn(`  기존 영역: ${existingAreas.join(", ")}`);
  console.warn("  이 작업이 기존 영역의 연속이면 오타 없이 그 이름을 그대로 쓰세요(위키 ### 헤딩과 정확히 일치).");
}

if (linked.length) {
  console.log(`[wiki-ingest] ${relativeUnit} linked`);
  console.log(`- area(s): ${linked.join(", ")}`);
  console.log(`- line: ${line}`);
  console.log(
    `- 이 줄이 이 영역의 현재 결정이면 ${CURRENT_MARKER} 를 이 줄로 옮기고, 대체된 이전 줄에 _(superseded by …)_ 를 다세요.`,
  );
}
if (reconciled.length) {
  console.log(`[wiki-ingest] ${relativeUnit} timeline date re-synced under: ${reconciled.join(", ")} (${unitDate})`);
}
if (already.length) {
  console.log(`[wiki-ingest] ${relativeUnit} already linked under: ${already.join(", ")}`);
}

// Resolves the area(s) this unit belongs to. Priority: --area (comma list) >
// primary-artifact frontmatter `area` (comma list, the durable source of truth) >
// --category (legacy single-value alias) > (feature: fail / bugfix,chore:
// operations bucket). A feature area must not be a broad bucket.
function resolveAreas() {
  const fromArg = parseAreaList(typeof args.area === "string" ? args.area : "");
  if (fromArg.length) {
    const fromFrontmatter = parseAreaList(parseFrontmatter(titleContent)?.area);
    if (fromFrontmatter.length && !sameAreaSet(fromArg, fromFrontmatter)) {
      console.warn(
        `[wiki-ingest] --area(${fromArg.join(", ")})가 주 아티팩트 frontmatter area(${fromFrontmatter.join(", ")})와 다릅니다. ` +
          `--area를 사용하지만 harness:check의 진실원은 frontmatter이니 둘을 정렬하세요.`,
      );
    }
    validateAreas(fromArg);
    return dedupe(fromArg);
  }

  const fromFrontmatter = parseAreaList(parseFrontmatter(titleContent)?.area);
  if (fromFrontmatter.length) {
    if (typeof args.category === "string" && parseAreaList(args.category).length) {
      console.warn(
        `[wiki-ingest] --category 무시: 주 아티팩트 frontmatter의 area가 우선입니다 (${fromFrontmatter.join(", ")}).`,
      );
    }
    validateAreas(fromFrontmatter);
    return dedupe(fromFrontmatter);
  }

  if (typeof args.category === "string" && args.category.trim()) {
    const category = args.category.trim();
    validateAreas([category]);
    if (type === "feature") {
      console.warn(
        `[wiki-ingest] area가 주 아티팩트에 선언되지 않아 --category "${category}"로 진행합니다. lineage 게이트를 켜려면 kickoff --area 또는 prd-helper로 area를 선언하세요.`,
      );
    }
    return [category];
  }

  if (type === "feature") {
    fail(
      `feature raw unit은 area가 필요합니다. 주 아티팩트(prd.md) frontmatter의 area, --area "<영역>", 또는 (레거시) --category "<영역>"으로 지정하세요. 여러 영역은 콤마로 나눕니다.`,
    );
  }

  const fallback = OPERATIONS_CATEGORIES[0];
  console.warn(`[wiki-ingest] area/--category 미지정 → 운영 버킷 "${fallback}" 사용`);
  return [fallback];
}

// A declared area (feature or bugfix) must not be a broad bucket. bugfix without a
// declared area falls back to the operations bucket before reaching this check.
function validateAreas(list) {
  if (type !== "feature" && type !== "bugfix") return;
  for (const area of list) {
    if (BROAD_FEATURE_CATEGORIES.has(area) || OPERATIONS_CATEGORIES.includes(area)) {
      fail(
        `${type} area "${area}"는 너무 넓습니다. 이 프로젝트의 실제 기능/구조 단위에 맞는 더 구체적인 영역으로 나눠서 지정하세요.`,
      );
    }
  }
}

function dedupe(list) {
  return [...new Set(list)];
}

function sameAreaSet(a, b) {
  const setB = new Set(b);
  return a.length === b.length && a.every((entry) => setB.has(entry));
}

// Ensures the unit's bullet exists under `### <area>` in chronological (ascending
// date) order. Idempotent per area: if the primary link is already present with the
// same date, nothing changes; if its date drifted, the line is re-synced in order
// (reconciled). The new line is spliced into the original section so non-bullet
// content (notes, sub-bullets, blank lines) is preserved. Undated legacy bullets
// sort above dated ones.
function upsertAreaLink(wikiText, area) {
  const lines = wikiText.split("\n");
  const headingText = `### ${area}`;
  const headingIndex = lines.findIndex((entry) => entry.trim() === headingText);

  if (headingIndex === -1) {
    return { wiki: createAreaSection(lines, headingText), inserted: true };
  }

  let end = headingIndex + 1;
  while (end < lines.length && !/^#{2,3}\s/.test(lines[end])) end += 1;

  const bulletIndices = [];
  for (let index = headingIndex + 1; index < end; index += 1) {
    if (/^-\s/.test(lines[index])) bulletIndices.push(index);
  }

  const existing = bulletIndices.find((index) => lines[index].includes(`](${primaryLink})`));
  if (existing !== undefined) {
    if (datedBulletDate(lines[existing]) === unitDate) {
      return { wiki: wikiText, inserted: false };
    }
    // Timeline date drifted (frontmatter date was corrected) → drop the stale line
    // and re-insert in order so harness:ingest is the recovery path.
    const without = [...lines.slice(0, existing), ...lines.slice(existing + 1)];
    return { wiki: upsertAreaLink(without.join("\n"), area).wiki, inserted: false, reconciled: true };
  }

  if (bulletIndices.length === 0) {
    const head = lines.slice(0, headingIndex + 1);
    const rest = lines.slice(headingIndex + 1);
    while (rest.length && rest[0].trim() === "") rest.shift();
    return { wiki: [...head, "", line, "", ...rest].join("\n"), inserted: true };
  }

  let target = bulletIndices[bulletIndices.length - 1] + 1;
  for (const index of bulletIndices) {
    const date = datedBulletDate(lines[index]);
    if (date && date > unitDate) {
      target = index;
      break;
    }
  }
  return { wiki: [...lines.slice(0, target), line, ...lines.slice(target)].join("\n"), inserted: true };
}

// Creates a new `### <area>` section, keeping it grouped inside the Raw Units area:
// before `## Maintenance`, else after the last existing `### ` section, else after
// the `## Raw Units` heading, else at EOF.
function createAreaSection(lines, headingText) {
  const anchor = areaSectionAnchor(lines);
  const head = lines.slice(0, anchor);
  while (head.length && head[head.length - 1].trim() === "") head.pop();
  const tail = lines.slice(anchor);
  while (tail.length && tail[0].trim() === "") tail.shift();
  return [...head, "", headingText, "", line, "", ...tail].join("\n");
}

function areaSectionAnchor(lines) {
  const maintenance = lines.findIndex((entry) => entry.startsWith("## Maintenance"));
  if (maintenance !== -1) return maintenance;

  let lastAreaEnd = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^###\s/.test(lines[index])) {
      let end = index + 1;
      while (end < lines.length && !/^#{2,3}\s/.test(lines[end])) end += 1;
      lastAreaEnd = end;
    }
  }
  if (lastAreaEnd !== -1) return lastAreaEnd;

  const rawUnits = lines.findIndex((entry) => /^##\s+Raw Units/.test(entry));
  if (rawUnits !== -1) {
    let end = rawUnits + 1;
    while (end < lines.length && !/^#{2,3}\s/.test(lines[end])) end += 1;
    return end;
  }
  return lines.length;
}
