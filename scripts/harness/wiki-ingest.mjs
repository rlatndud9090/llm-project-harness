#!/usr/bin/env node
import path from "node:path";
import {
  BROAD_FEATURE_CATEGORIES,
  CURRENT_MARKER,
  OPERATIONS_CATEGORIES,
  collectDeclaredSections,
  datedBulletDate,
  extractH1,
  fail,
  inferRawUnitFromBranch,
  parseArgs,
  parseAreaList,
  parseFrontmatter,
  pathExists,
  rawLinksInLine,
  rawUnitPath,
  readText,
  readUnitSection,
  relativeFromWiki,
  repoPath,
  sectionFileName,
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

const wikiDir = repoPath("docs", "wiki");
const indexPath = path.join(wikiDir, "index.md");

const primaryLink = relativeFromWiki(path.join(unitDir, titleSource[1]));
const linkParts = files.map(([label, fileName]) => `[${label}](${relativeFromWiki(path.join(unitDir, fileName))})`);
const line = `- \`${unitDate}\` **${title}** — ${linkParts.join(" · ")}`;

// ─── section 축 라우팅 결정 ──────────────────────────────────────────────────
// 이 unit의 section(--section > 주 아티팩트 frontmatter section:)과 프로젝트 전체의
// distinct 선언 section 수가 wiki 레이아웃을 정한다. 선언 section이 1개 이하면 모든
// area가 index.md에 남고, 2개 이상이면 각 section이 docs/wiki/<섹션>.md로 분리된다.
const sectionName = resolveSection();
const declaredSections = collectDeclaredSections();
if (sectionName) declaredSections.add(sectionName);
const split = declaredSections.size >= 2;

// Legacy safety valve: an already-linked unit with no area/section signal at all
// (no --area, no --category, no frontmatter area, no section) is a pre-area unit
// being re-ingested. Treat it as a no-op instead of failing the "feature needs an
// area" guard, so an old `harness:ingest -- <path>` call keeps working on a legacy
// consumer. Only applies to the unsplit index (a split project always has sections).
const hasAreaSignal =
  (typeof args.area === "string" && parseAreaList(args.area).length > 0) ||
  (typeof args.category === "string" && args.category.trim().length > 0) ||
  parseAreaList(parseFrontmatter(titleContent)?.area).length > 0;
if (!split && !hasAreaSignal && !sectionName && pathExists(indexPath) && readText(indexPath).includes(`](${primaryLink})`)) {
  console.log(`[wiki-ingest] ${relativeUnit} already linked (area 미선언 레거시 unit — 그대로 둡니다)`);
  process.exit(0);
}

const areas = resolveAreas();

let targetPath;
let existingHeadings = [];
const migratedSections = [];

// An operations-bucket unit (a section-less, area-less bugfix/chore that fell back
// to `프로젝트 운영`) always lives in index.md, even in a split project — it needs
// no section. Only real areas (features, and bugfixes that declare an area) are
// routed to a section file.
const areasAreOperationsOnly = areas.every((area) => OPERATIONS_CATEGORIES.includes(area));

if (split && !areasAreOperationsOnly) {
  if (!sectionName) {
    fail(
      `이 프로젝트는 선언된 섹션이 2개 이상이라 wiki가 섹션별 파일로 분리돼 있습니다. ` +
        `이 unit의 ${type === "feature" ? "prd.md" : "bugfix.md"} frontmatter에 section을 선언하거나 ` +
        `--section "<섹션>"으로 지정하세요.`,
    );
  }
  const sectionFile = requireSectionFile(sectionName);
  targetPath = path.join(wikiDir, sectionFile);

  // Split the single-index wiki into per-section files the first time we cross the
  // 2-section threshold (idempotent: a no-op once index.md is already a hub).
  ensureSplit();

  // Make sure this unit's section file exists and the index hub links to it.
  ensureSectionFileAndHubLink(sectionName, sectionFile);

  existingHeadings = headingNames(readText(targetPath));
} else {
  // index.md holds everything (unsplit project) or the operations bucket (split
  // project). Ensure the split has already happened so index is the right shape.
  if (split) ensureSplit();
  targetPath = indexPath;
  existingHeadings = pathExists(indexPath) ? headingNames(readText(indexPath)) : [];
}

let wiki = readText(targetPath);

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

writeText(targetPath, wiki);

const targetRel = toPosix(path.relative(process.cwd(), targetPath));
const existingAreas = existingHeadings.filter((heading) => !OPERATIONS_CATEGORIES.includes(heading));
const newAreas = areas.filter((area) => !existingHeadings.includes(area) && !OPERATIONS_CATEGORIES.includes(area));
if (newAreas.length && existingAreas.length) {
  console.warn(`[wiki-ingest] 새 영역 생성: ${newAreas.join(", ")}`);
  console.warn(`  기존 영역: ${existingAreas.join(", ")}`);
  console.warn("  이 작업이 기존 영역의 연속이면 오타 없이 그 이름을 그대로 쓰세요(위키 ### 헤딩과 정확히 일치).");
}

if (migratedSections.length) {
  console.log(`[wiki-ingest] 섹션 2개 이상 → wiki 분리: index.md의 영역 계보를 ${migratedSections.join(", ")}로 이동하고 index를 섹션 링크 허브로 재작성했습니다.`);
}
if (sectionName) {
  console.log(`[wiki-ingest] section: ${sectionName} → ${toPosix(path.relative(process.cwd(), targetPath))}`);
}
if (linked.length) {
  console.log(`[wiki-ingest] ${relativeUnit} linked (${targetRel})`);
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

// ─── section 헬퍼 ────────────────────────────────────────────────────────────

// This unit's section: --section overrides, else the primary artifact's
// frontmatter `section:`. A mismatch between the two is a warning (frontmatter is
// the durable source of truth). Returns null when neither is set.
function resolveSection() {
  const fromArg = typeof args.section === "string" && args.section.trim() ? args.section.trim() : null;
  const fromFrontmatter = readUnitSection(unitDir, type);
  if (fromArg && fromFrontmatter && fromArg !== fromFrontmatter) {
    console.warn(
      `[wiki-ingest] --section("${fromArg}")가 주 아티팩트 frontmatter section("${fromFrontmatter}")와 다릅니다. ` +
        `--section을 사용하지만 harness:check의 진실원은 frontmatter이니 둘을 정렬하세요.`,
    );
  }
  return fromArg ?? fromFrontmatter;
}

// Resolves a section name to its wiki filename, failing loudly on an unusable name
// (empty after sanitize, or a reserved basename like index).
function requireSectionFile(name) {
  const fileName = sectionFileName(name);
  if (!fileName) {
    fail(`섹션 이름 "${name}"을 wiki 파일명으로 변환할 수 없습니다(빈 값이거나 예약어). 다른 섹션 이름을 쓰세요.`);
  }
  return fileName;
}

// The `### <area>` heading names present in a wiki file.
function headingNames(content) {
  return [...content.matchAll(/^### (.+)$/gm)].map((match) => match[1].trim());
}

// One-time migration when the project crosses into >=2 sections: move index.md's
// per-area lineage blocks into their owning section files (preserving the exact
// bullet lines and their navigation labels), then rewrite index.md as a section
// link hub. Idempotent — does nothing once index.md is already a hub.
function ensureSplit() {
  if (!pathExists(indexPath)) return;
  const index = readText(indexPath);
  if (hasHub(index)) return; // already split

  const lines = index.split("\n");

  // An area block runs from a `### ` heading to the next `### `/`## `/`# ` heading
  // (or EOF), carrying every line in between (bullets, notes, blanks).
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^### (.+)$/.test(line)) {
      current = { name: line.replace(/^###\s+/, "").trim(), start: i, lines: [line] };
      blocks.push(current);
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      current = null;
    }
    if (current) current.lines.push(line);
  }

  // Decide each block's destination section by the sections its linked units
  // declare. Operations blocks and section-less blocks stay in index.md.
  const bySection = new Map(); // sectionName -> array of block line arrays
  const leftoverBlockNames = new Set();
  for (const block of blocks) {
    if (OPERATIONS_CATEGORIES.includes(block.name)) {
      leftoverBlockNames.add(block.name);
      continue;
    }
    const blockSection = sectionOfBlock(block.lines);
    if (!blockSection) {
      leftoverBlockNames.add(block.name);
      continue;
    }
    if (!bySection.has(blockSection)) bySection.set(blockSection, []);
    bySection.get(blockSection).push(block.lines);
  }

  if (bySection.size === 0) return; // nothing sectioned to move yet

  // Append each section's blocks to its file (creating the file if needed).
  for (const [name, blockList] of bySection) {
    const fileName = requireSectionFile(name);
    const filePath = path.join(wikiDir, fileName);
    let content = pathExists(filePath) ? readText(filePath) : sectionFileSkeleton(name);
    for (const blockLines of blockList) {
      content = `${content.replace(/\s+$/, "")}\n\n${blockLines.join("\n").replace(/\s+$/, "")}\n`;
    }
    writeText(filePath, content);
    migratedSections.push(fileName);
  }

  // Rebuild index.md: keep everything except the moved area blocks, and insert a
  // `## 섹션` hub before Maintenance (or where the area region was).
  const movedLineIndices = new Set();
  for (const block of blocks) {
    if (leftoverBlockNames.has(block.name)) continue;
    for (let j = block.start; j < block.start + block.lines.length; j += 1) movedLineIndices.add(j);
  }
  const remaining = lines.filter((_, i) => !movedLineIndices.has(i));
  writeText(indexPath, insertHub(remaining, [...bySection.keys()]));
}

// The section a block belongs to: the single non-null section declared by the
// units its bullets link. Returns null when no linked unit declares a section.
function sectionOfBlock(blockLines) {
  const found = new Set();
  for (const raw of blockLines) {
    for (const link of rawLinksInLine(raw)) {
      const match = /\.\.\/raw\/(feature|bugfix|chore)\/([^/]+)\//.exec(link);
      if (!match) continue;
      const [, unitType, unitSlug] = match;
      const dir = repoPath("docs", "raw", unitType, unitSlug);
      const sec = readUnitSection(dir, unitType);
      if (sec) found.add(sec);
    }
  }
  if (found.size > 1) {
    console.warn(`[wiki-ingest] 한 영역 블록이 여러 섹션(${[...found].join(", ")})을 가리킵니다. 첫 섹션으로 이동합니다.`);
  }
  return found.size ? [...found][0] : null;
}

// Detects the post-split hub state: index.md carries the `## 섹션` heading.
function hasHub(index) {
  return /^##\s+섹션\s*$/m.test(index);
}

// Fresh section file: an H1 with the section name and a one-line navigation note.
function sectionFileSkeleton(name) {
  return `# ${name}\n\n> \`docs/wiki/index.md\`에서 링크된 섹션 파일. 이 섹션의 영역(area)별 시간순 계보다.\n`;
}

// Inserts (or reuses) the `## 섹션` hub with a link to each section file. Placed
// just before `## Maintenance` when present, else appended.
function insertHub(lines, sectionNames) {
  const bullets = sectionNames.map((name) => `- [${name}](${requireSectionFile(name)})`);
  const hub = ["## 섹션", "", ...bullets, ""];

  const maintenanceIndex = lines.findIndex((line) => /^##\s+Maintenance/.test(line));
  const head = maintenanceIndex === -1 ? [...lines] : lines.slice(0, maintenanceIndex);
  const tail = maintenanceIndex === -1 ? [] : lines.slice(maintenanceIndex);
  while (head.length && head[head.length - 1].trim() === "") head.pop();
  while (tail.length && tail[0].trim() === "") tail.shift();
  return [...head, "", ...hub, ...(tail.length ? tail : [])].join("\n").replace(/\n{3,}/g, "\n\n");
}

// Ensures the section file exists and the index hub has a link to it. Used on
// every split-mode ingest so a brand-new section (added after the initial split)
// gets its file and hub entry.
function ensureSectionFileAndHubLink(name, fileName) {
  const filePath = path.join(wikiDir, fileName);
  if (!pathExists(filePath)) writeText(filePath, sectionFileSkeleton(name));

  let index = pathExists(indexPath) ? readText(indexPath) : "";
  if (!hasHub(index)) {
    index = insertHub(index.split("\n"), [name]);
    writeText(indexPath, index);
    return;
  }
  if (index.includes(`](${fileName})`)) return; // hub already links it

  const lines = index.split("\n");
  const hubIndex = lines.findIndex((line) => /^##\s+섹션\s*$/.test(line));
  // Insert the new link after the last existing bullet in the hub section.
  let insertAt = hubIndex + 1;
  for (let i = hubIndex + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    if (/^-\s/.test(lines[i])) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, `- [${name}](${fileName})`);
  writeText(indexPath, lines.join("\n"));
}

// ─── area 해석 (기존 로직 유지) ──────────────────────────────────────────────

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

// Creates a new `### <area>` section. In the index it stays grouped inside the Raw
// Units area (before `## Maintenance`, else after the last existing `### ` section,
// else after `## Raw Units`, else EOF). In a section file none of those anchors
// exist, so it appends after the last `### ` section or at EOF.
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
