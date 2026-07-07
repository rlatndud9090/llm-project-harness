#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  BROAD_FEATURE_CATEGORIES,
  CURRENT_MARKER,
  OPERATIONS_CATEGORIES,
  POST_APPROVAL_STAGES,
  changelogHeadId,
  REPO_ROOT,
  STAGE_VALUES,
  adrBodyLooksAuthored,
  bodyAfterFrontmatter,
  collectDeclaredSections,
  fail,
  isPreAdrStage,
  skeletonAdrBody,
  findHarnessRoot,
  getCurrentBranch,
  gitShow,
  isForbiddenStageTransition,
  isForbiddenTransition,
  isHarnessRepository,
  listMarkdownFiles,
  listWikiFiles,
  parseApprovalEvents,
  parseAreaSections,
  parseFrontmatter,
  parseWorkBranch,
  pathExists,
  primaryArtifactName,
  readText,
  readUnitAreas,
  readUnitSection,
  repoPath,
  sectionFileName,
  toPosix,
} from "./lib.mjs";

const errors = [];
const harnessRoot = findHarnessRoot();
const harnessRepoMode = isHarnessRepository();
// Broad buckets a feature must never live in — the narrow-area rule, shared with
// wiki-ingest via lib (broad feature names ∪ reserved operations buckets).
const DISALLOWED_FEATURE_WIKI_CATEGORIES = new Set([...BROAD_FEATURE_CATEGORIES, ...OPERATIONS_CATEGORIES]);

function addError(message) {
  errors.push(message);
}

function harnessPath(...parts) {
  return path.join(harnessRoot, ...parts);
}

function rootAdapterPath(...parts) {
  return repoPath(...parts);
}

function assertHarnessShape() {
  for (const requiredPath of [
    harnessPath("harness", "README.md"),
    harnessPath("harness", "protocols", "session-start.md"),
    harnessPath("harness", "protocols", "submodule-attach.md"),
    harnessPath("harness", "templates", "raw", "feature-prd.md"),
    harnessPath("harness", "templates", "raw", "feature-adr.md"),
    harnessPath("harness", "templates", "raw", "notes.md"),
    harnessPath("harness", "templates", "wiki", "index.md"),
    harnessPath("scripts", "harness", "attach-submodule.mjs"),
    harnessPath("scripts", "harness", "kickoff.mjs"),
  ]) {
    if (!pathExists(requiredPath)) {
      addError(`missing harness file: ${toPosix(path.relative(harnessRoot, requiredPath))}`);
    }
  }
}

function assertNoHarnessDocsNamespace() {
  if (!harnessRepoMode) return;

  for (const removedPath of [repoPath("docs", "harness"), repoPath("docs", "raw"), repoPath("docs", "wiki")]) {
    if (pathExists(removedPath)) {
      addError(`harness repository must not own consumer docs namespace: ${toPosix(path.relative(process.cwd(), removedPath))}`);
    }
  }
}

function assertProjectDocsPresent() {
  if (harnessRepoMode) return;

  for (const requiredPath of [
    repoPath("docs", "raw"),
    repoPath("docs", "wiki", "index.md"),
    repoPath("AGENTS.md"),
  ]) {
    if (!pathExists(requiredPath)) {
      addError(`missing consuming project artifact: ${toPosix(path.relative(process.cwd(), requiredPath))}`);
    }
  }
}

// Consumer reconciliation gate: after updating the `.harness` submodule, the
// project must reconcile the new CHANGELOG entries (each carries a required
// consumer action, e.g. rewriting docs/wiki) and record it with harness:sync.
// Fails until `.harness-sync` matches the harness CHANGELOG head. Skips in the
// provider repo and when the submodule predates the changelog.
function assertHarnessSync() {
  if (harnessRepoMode) return;

  const changelogPath = harnessPath("CHANGELOG.md");
  if (!pathExists(changelogPath)) return;

  const head = changelogHeadId(readText(changelogPath));
  if (!head) return;

  const syncPath = repoPath(".harness-sync");
  const acked = pathExists(syncPath) ? readText(syncPath).trim() : "";
  if (acked !== head) {
    addError(
      `harness updated but not reconciled: .harness-sync "${acked || "(missing)"}" != CHANGELOG head "${head}". ` +
        `Run "npm run harness:sync" to read the required consumer actions, apply them, then "npm run harness:sync --ack".`,
    );
  }
}

// The wiki is index.md plus (when the project declares >=2 sections) one file per
// declared section. Any other file is stale/unexpected. A single-index project
// (<=2 sections... i.e. <2) must not carry section files at all.
function assertWikiShape() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki"))) return;

  const wikiDir = repoPath("docs", "wiki");
  const entries = fs.readdirSync(wikiDir).filter((entry) => !entry.startsWith("."));

  const declaredSections = collectDeclaredSections();
  const split = declaredSections.size >= 2;
  const allowed = new Set(["index.md"]);
  const fileToSection = new Map();
  for (const section of declaredSections) {
    const fileName = sectionFileName(section);
    if (!fileName) {
      addError(`section "${section}" cannot map to a wiki filename (empty or reserved); rename it`);
      continue;
    }
    if (fileToSection.has(fileName) && fileToSection.get(fileName) !== section) {
      addError(`sections "${fileToSection.get(fileName)}" and "${section}" map to the same wiki file "${fileName}"; rename one`);
    }
    fileToSection.set(fileName, section);
    if (split) allowed.add(fileName);
  }

  const unexpected = entries.filter((entry) => !allowed.has(entry));
  if (unexpected.length > 0) {
    const shape = split ? "index.md and declared section files" : "index.md";
    addError(`docs/wiki must contain only ${shape}; found ${unexpected.join(", ")}`);
  }
}

function assertWikiLinks() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  for (const wikiPath of listWikiFiles()) {
    const wiki = readText(wikiPath);
    const links = [...wiki.matchAll(/\]\((\.\.\/raw\/[^)]+)\)/g)].map((match) => match[1]);
    for (const link of links) {
      const target = path.resolve(path.dirname(wikiPath), link);
      if (!pathExists(target)) {
        addError(`broken wiki raw link: ${link} (${path.basename(wikiPath)})`);
      }
    }
  }
}

function assertWikiFeatureTaxonomy() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  const featureDirs = unitDirs("feature");
  if (featureDirs.length === 0) return;

  const wikiDir = repoPath("docs", "wiki");
  for (const wikiPath of listWikiFiles()) {
    const categories = parseWikiCategories(readText(wikiPath));
    for (const unitDir of featureDirs) {
      const markdownFiles = fs
        .readdirSync(unitDir)
        .filter((entry) => entry.endsWith(".md"))
        .map((entry) => path.join(unitDir, entry));
      const linkedCategories = new Set(
        markdownFiles
          .map((filePath) => findCategoryForLink(categories, toPosix(path.relative(wikiDir, filePath))))
          .filter(Boolean),
      );

      for (const category of linkedCategories) {
        if (DISALLOWED_FEATURE_WIKI_CATEGORIES.has(category)) {
          addError(
            `feature raw unit must not be linked under broad wiki category "${category}": ${toPosix(path.relative(process.cwd(), unitDir))}`,
          );
        }
      }
    }
  }
}

function unitDirs(type) {
  const base = repoPath("docs", "raw", type);
  if (!pathExists(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name));
}

function parseWikiCategories(wiki) {
  const categories = [];
  let current = null;
  for (const line of wiki.split(/\r?\n/)) {
    const match = /^### (.+)$/.exec(line);
    if (match) {
      current = { name: match[1].trim(), lines: [] };
      categories.push(current);
      continue;
    }
    // Close the section at the next `##` heading so a following (non-area) `## `
    // section's raw links are not mis-attributed to the preceding area. This keeps
    // parseWikiCategories consistent with lib's parseAreaSections.
    if (/^##\s+/.test(line)) {
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  return categories;
}

function findCategoryForLink(categories, relativeLink) {
  for (const category of categories) {
    if (category.lines.some((line) => line.includes(`](${relativeLink})`))) {
      return category.name;
    }
  }
  return null;
}

// ─── area 축 기계강제 (consumer 모드 전용) ──────────────────────────────────
// "구조는 기계강제, 의미는 모델재량": area 존재(활성 작업)·broad 금지·선언↔렌더
// 일치·날짜 위조·현재 마커 구조 불변식만 본다. 어느 area인지·발전 서사·어느 줄이
// 현재인지·주석 문구는 모델이 채운다.

// 선언한 feature area가 broad 버킷이면 차단(선언 시에만 발동 = opt-in). 그리고 현재
// 작업 브랜치의 unit이 review/approved(bugfix는 review/fixed)면 area 선언을 강제한다.
// assertCurrentBranchRawUnit과 같은 current-branch 스코프라 레거시 unit·main/HEAD
// 검사에는 무영향.
function assertAreaField() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  // A declared area (feature or bugfix) must not be a broad bucket.
  for (const type of ["feature", "bugfix"]) {
    for (const unitDir of unitDirs(type)) {
      const rel = toPosix(path.relative(process.cwd(), unitDir));
      for (const area of readUnitAreas(unitDir, type)) {
        if (BROAD_FEATURE_CATEGORIES.has(area) || OPERATIONS_CATEGORIES.includes(area)) {
          addError(`${type} area "${area}" is too broad; declare a narrower functional/structural area: ${rel}`);
        }
      }
    }
  }

  // Hard-require an area only on the active feature work branch. bugfix area is
  // optional by design (template + ingest fall back to the operations bucket), so
  // it is never required. Scoped to the current branch (like
  // assertCurrentBranchRawUnit) so main/HEAD and legacy units are untouched.
  const branch = getCurrentBranch();
  if (branch === "main" || branch === "HEAD") return;
  const parsed = parseWorkBranch(branch);
  if (!parsed || parsed.invalid || parsed.type !== "feature") return;

  const unitDir = repoPath("docs", "raw", parsed.type, parsed.slug);
  const artifactPath = path.join(unitDir, "prd.md");
  if (!pathExists(artifactPath)) return;

  const status = parseFrontmatter(readText(artifactPath))?.status;
  if (status !== "review" && status !== "approved") return;

  if (readUnitAreas(unitDir, "feature").length === 0) {
    const rel = toPosix(path.relative(process.cwd(), unitDir));
    addError(
      `active feature unit at status "${status}" must declare an area in prd.md frontmatter (area: "<영역>", 여러 개는 콤마): ${rel}`,
    );
  }
}

// 선언한 area 집합 == 위키에서 링크된 `### 헤딩` 집합(양방향). frontmatter(진실)와
// wiki(뷰)의 그룹핑 drift·조용한 개명을 차단. 미선언 unit은 skip(opt-in). wiki가
// 섹션별로 분리된 경우엔 unit이 자기 섹션 파일에만 링크돼야 한다(라우팅 강제).
function assertAreaGrouping() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  const wikiDir = repoPath("docs", "wiki");
  const indexPath = repoPath("docs", "wiki", "index.md");
  const wikiPaths = listWikiFiles();
  const categoriesByFile = new Map(wikiPaths.map((wikiPath) => [wikiPath, parseWikiCategories(readText(wikiPath))]));

  const split = collectDeclaredSections().size >= 2;

  for (const type of ["feature", "bugfix"]) {
    for (const unitDir of unitDirs(type)) {
      const declared = readUnitAreas(unitDir, type);
      if (declared.length === 0) continue;

      const rel = toPosix(path.relative(process.cwd(), unitDir));
      const declaredSet = new Set(declared);

      // The wiki file that must hold this unit's areas: its section's file when
      // the wiki is split, else the single index.
      let expectedPath = indexPath;
      if (split) {
        const section = readUnitSection(unitDir, type);
        if (!section) {
          addError(`${type} unit must declare a section (wiki is split into per-section files): ${rel}`);
          continue;
        }
        const fileName = sectionFileName(section);
        if (!fileName) {
          addError(`${type} unit section "${section}" cannot map to a wiki filename: ${rel}`);
          continue;
        }
        expectedPath = path.join(wikiDir, fileName);
      }

      // Headings this unit is linked under, per file. A link in any file other
      // than the expected one is a routing violation.
      let expectedHeadings = new Set();
      for (const wikiPath of wikiPaths) {
        const headings = findLinkedHeadings(categoriesByFile.get(wikiPath), wikiPath, unitDir);
        if (headings.size === 0) continue;
        if (wikiPath === expectedPath) {
          expectedHeadings = headings;
        } else {
          addError(
            `${type} unit is linked in ${path.basename(wikiPath)} but its section routes it to ${path.basename(expectedPath)}: ${rel}`,
          );
        }
      }

      for (const area of declaredSet) {
        if (!expectedHeadings.has(area)) {
          addError(
            `${type} unit declares area "${area}" but is not linked under "### ${area}" in ${path.basename(expectedPath)}: ${rel}`,
          );
        }
      }
      for (const heading of expectedHeadings) {
        if (OPERATIONS_CATEGORIES.includes(heading)) continue;
        if (!declaredSet.has(heading)) {
          addError(
            `${type} unit is linked under "### ${heading}" but does not declare area "${heading}" in ${primaryArtifactName(type)}: ${rel}`,
          );
        }
      }
    }
  }
}

// Every `### ` heading under which any of the unit's md links appears. Unlike
// findCategoryForLink (first match only), this returns all of them, so a
// multi-area unit linked under several headings is fully accounted for.
function findLinkedHeadings(categories, wikiPath, unitDir) {
  const headings = new Set();
  const relLinks = fs
    .readdirSync(unitDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => toPosix(path.relative(path.dirname(wikiPath), path.join(unitDir, entry))));
  for (const category of categories) {
    if (category.lines.some((line) => relLinks.some((relLink) => line.includes(`](${relLink})`)))) {
      headings.add(category.name);
    }
  }
  return headings;
}

// 시간축 구조 게이트(비운영 섹션). date-parity: 렌더된 날짜가 링크된 raw frontmatter
// date와 일치(위조 타임라인 hard 차단). ordering: 날짜 있는 줄이 오름차순이 아니면
// nudge(date 교정↔멱등 충돌 흡수). 날짜 없는 레거시 줄은 둘 다 skip.
function assertAreaTimeline() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  for (const wikiPath of listWikiFiles()) {
    for (const section of parseAreaSections(readText(wikiPath))) {
      if (section.isOperations) continue;
      const dated = section.lines.filter((entry) => entry.date);

      for (const entry of dated) {
        // The date source is the unit's dated artifact (prd.md/bugfix.md), found by
        // suffix so a manual [ADR]-first reorder of the line does not misfire.
        const dateLink = entry.links.find((link) => link.endsWith("/prd.md") || link.endsWith("/bugfix.md")) ?? entry.primaryLink;
        if (!dateLink) continue;
        const target = path.resolve(path.dirname(wikiPath), dateLink);
        if (!pathExists(target)) continue; // broken link is assertWikiLinks' job
        const rawDate = parseFrontmatter(readText(target))?.date;
        if (rawDate && rawDate !== entry.date) {
          addError(
            `wiki timeline date ${entry.date} does not match ${dateLink} frontmatter date ${rawDate} (### ${section.name} in ${path.basename(wikiPath)})`,
          );
        }
      }

      for (let index = 1; index < dated.length; index += 1) {
        if (dated[index].date < dated[index - 1].date) {
          console.warn(
            `[harness:check] WARNING: "### ${section.name}" (${path.basename(wikiPath)}) 타임라인이 시간순이 아닙니다 (${dated[index - 1].date} → ${dated[index].date}); 오래된→최신으로 정렬하세요.`,
          );
          break;
        }
      }
    }
  }
}

// 현재 포인터 구조 불변식(비운영 섹션). 섹션당 현재 마커 최대 1개. 현재 마커 줄은
// superseded 주석을 함께 갖지 못하고, 그 줄의 ADR이 superseded 상태여도 안 된다.
// "정확히 하나의 현재"는 강제하지 않는다(현재=파생, 최하단이 암묵적 현재).
function assertAreaCurrency() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  for (const wikiPath of listWikiFiles()) {
    for (const section of parseAreaSections(readText(wikiPath))) {
      if (section.isOperations) continue;
      const current = section.lines.filter((entry) => entry.hasCurrent);
      if (current.length > 1) {
        addError(
          `"### ${section.name}" (${path.basename(wikiPath)}) marks ${current.length} current decisions (${CURRENT_MARKER}); at most one line may be current.`,
        );
      }
      for (const entry of current) {
        if (entry.hasSuperseded) {
          addError(`"### ${section.name}" line marked ${CURRENT_MARKER} is also marked superseded; a superseded decision is not current.`);
        }
        if (entry.adrLink) {
          const target = path.resolve(path.dirname(wikiPath), entry.adrLink);
          const adrStatus = pathExists(target) ? parseFrontmatter(readText(target))?.status : undefined;
          if (adrStatus === "superseded" || adrStatus === "deprecated") {
            addError(
              `"### ${section.name}" line marked ${CURRENT_MARKER} links a ${adrStatus} ADR (${entry.adrLink}); move ${CURRENT_MARKER} to the current decision.`,
            );
          }
        }
      }
    }
  }
}

// 섹션 축 레이아웃 불변식: (1) 선언 섹션이 2개 이상이면 index.md가 `## 섹션` 허브여야
// 하고, 2개 미만이면 허브가 없어야 한다(분리 상태 정합). (2) 허브의 섹션 링크는 실제
// 파일을 가리켜야 한다. (3) 섹션 이름도 broad 바구니면 안 된다. "어느 섹션인가"는 모델
// 몫이고, 구조 불변식만 기계강제한다.
function assertSectionLayout() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  const declaredSections = collectDeclaredSections();
  const split = declaredSections.size >= 2;
  const index = readText(repoPath("docs", "wiki", "index.md"));
  const hasHub = /^##\s+섹션\s*$/m.test(index);

  if (split && !hasHub) {
    addError(
      `${declaredSections.size}개 섹션이 선언됐지만 docs/wiki/index.md가 섹션 허브가 아닙니다("## 섹션" 없음); npm run harness:ingest로 분리하세요.`,
    );
  }
  if (!split && hasHub) {
    addError(`docs/wiki/index.md에 "## 섹션" 허브가 있지만 선언된 섹션이 2개 미만입니다.`);
  }

  for (const section of declaredSections) {
    if (BROAD_FEATURE_CATEGORIES.has(section)) {
      addError(`section "${section}" is too broad; name the actual product/routing surface.`);
    }
  }

  if (hasHub) {
    // Local `](name.md)` links (raw links contain a slash) are section-file links.
    const localLinks = [...index.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]).filter((link) => !link.includes("/"));
    for (const link of localLinks) {
      if (!pathExists(repoPath("docs", "wiki", link))) {
        addError(`index hub links a missing section file: ${link}`);
      }
    }
  }
}

function assertRawUnits() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  for (const unitDir of unitDirs("feature")) {
    for (const fileName of ["prd.md", "adr.md"]) {
      if (!pathExists(path.join(unitDir, fileName))) {
        addError(`feature unit missing ${fileName}: ${toPosix(path.relative(process.cwd(), unitDir))}`);
      }
    }
  }

  for (const type of ["bugfix", "chore"]) {
    for (const unitDir of unitDirs(type)) {
      const hasMarkdown = fs.readdirSync(unitDir).some((entry) => entry.endsWith(".md"));
      if (!hasMarkdown) {
        addError(`${type} unit has no markdown artifact: ${toPosix(path.relative(process.cwd(), unitDir))}`);
      }
    }
  }
}

function assertRawUnitsLinked() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  const wikiDir = repoPath("docs", "wiki");
  // A unit may be linked from index.md or any section file — join them all.
  const wiki = listWikiFiles().map(readText).join("\n");
  for (const type of ["feature", "bugfix", "chore"]) {
    for (const unitDir of unitDirs(type)) {
      const markdownFiles = fs
        .readdirSync(unitDir)
        .filter((entry) => entry.endsWith(".md"))
        .map((entry) => path.join(unitDir, entry));

      const hasWikiLink = markdownFiles.some((filePath) => {
        const relative = toPosix(path.relative(wikiDir, filePath));
        return wiki.includes(`](${relative})`);
      });

      if (!hasWikiLink) {
        addError(`raw unit is not linked from docs/wiki: ${toPosix(path.relative(process.cwd(), unitDir))}`);
      }
    }
  }
}

function assertCurrentBranchRawUnit() {
  if (harnessRepoMode) return;

  const branch = getCurrentBranch();
  if (branch === "main" || branch === "HEAD") return;

  const parsed = parseWorkBranch(branch);
  if (!parsed) {
    addError(`work branch must match feature/<slug>, bugfix/<slug>, or chore/<slug>: ${branch}`);
    return;
  }
  if (parsed.invalid) {
    addError(parsed.invalid);
    return;
  }

  const expected = repoPath("docs", "raw", parsed.type, parsed.slug);
  if (!pathExists(expected)) {
    addError(`current branch raw unit missing: docs/raw/${parsed.type}/${parsed.slug}`);
  }
}

function assertFrontmatter() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  const files = listMarkdownFiles(repoPath("docs", "raw"));
  const required = ["title", "date", "status", "unit_type"];
  // chore units are notes-only (notes.md, no status lifecycle), so only these
  // three carry a machine-checked status.
  const allowedStatuses = {
    "prd.md": new Set(["draft", "review", "approved", "rejected"]),
    "adr.md": new Set(["proposed", "accepted", "deprecated", "superseded"]),
    "bugfix.md": new Set(["draft", "review", "fixed", "rejected"]),
  };

  for (const filePath of files) {
    const baseName = path.basename(filePath);
    if (!["prd.md", "adr.md", "bugfix.md"].includes(baseName)) continue;

    const relative = toPosix(path.relative(process.cwd(), filePath));
    const fields = parseFrontmatter(readText(filePath));
    if (!fields) {
      addError(`missing frontmatter: ${relative}`);
      continue;
    }

    for (const key of required) {
      if (!fields[key]) addError(`frontmatter missing ${key}: ${relative}`);
    }

    if (fields.date && !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
      addError(`frontmatter date must be YYYY-MM-DD: ${relative}`);
    }

    if (fields.status && !allowedStatuses[baseName].has(fields.status)) {
      addError(`frontmatter status is invalid for ${baseName}: ${relative}`);
    }

    const expectedType = relative.split("/")[2];
    if (fields.unit_type && fields.unit_type !== expectedType) {
      addError(`frontmatter unit_type must be ${expectedType}: ${relative}`);
    }

    if (baseName === "prd.md" && fields.status === "approved") {
      assertApprovalField(fields, relative, "approved PRD");
    }

    if (baseName === "adr.md" && fields.status === "accepted") {
      assertApprovalField(fields, relative, "accepted ADR");
    }
  }
}

function assertApprovalField(fields, relative, label) {
  if (!fields.approval) {
    addError(`${label} must include approval frontmatter: ${relative}`);
    return;
  }

  if (!/^user:\d{4}-\d{2}-\d{2}:.+/.test(fields.approval)) {
    addError(`${label} approval must match user:YYYY-MM-DD:<reason>: ${relative}`);
  }
}

// A raw unit that has reached a "content settled" status must not still carry
// kickoff template scaffolding. The most reliable signal is an unsubstituted
// `{...}` token (kickoff never fills `{이름}`, and `{제목}`/`{slug}` only survive
// when kickoff was bypassed); a few template-only phrases back it up. This turns
// the narrative "no placeholder PRD/ADR" rule into a machine gate.
const PLACEHOLDER_SENTINELS = {
  "prd.md": {
    statuses: new Set(["review", "approved"]),
    markers: ["목표 1", "요구사항 1", "완료 기준 1", "제외 항목 1"],
  },
  "adr.md": {
    statuses: new Set(["accepted"]),
    markers: ["후속 작업 1"],
  },
  "bugfix.md": {
    statuses: new Set(["review", "fixed"]),
    markers: ["재발을 막는 테스트 또는 검증"],
  },
};

function assertNoPlaceholders() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  for (const filePath of listMarkdownFiles(repoPath("docs", "raw"))) {
    const baseName = path.basename(filePath);
    const rule = PLACEHOLDER_SENTINELS[baseName];
    if (!rule) continue;

    const content = readText(filePath);
    const fields = parseFrontmatter(content);
    if (!fields?.status || !rule.statuses.has(fields.status)) continue;

    const relative = toPosix(path.relative(process.cwd(), filePath));
    const body = bodyAfterFrontmatter(content);

    // Strip code fences and inline code before the `{…}` token scan: an accepted
    // ADR may legitimately show dict/enum literals (e.g. `Phase { EXPLORE }`) that
    // are not leftover template tokens. Real leftover tokens ({이름}/{제목}/{slug})
    // live in prose/headings, not code, so this keeps the token gate meaningful.
    const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    const tokenMatch = prose.match(/\{[^}\n]{1,40}\}/);
    if (tokenMatch) {
      addError(`${baseName} (status ${fields.status}) still has an unsubstituted template token ${tokenMatch[0]}: ${relative}`);
    }

    for (const marker of rule.markers) {
      if (body.includes(marker)) {
        addError(`${baseName} (status ${fields.status}) still contains template placeholder "${marker}": ${relative}`);
      }
    }
  }
}

// "content settled" 상태의 raw unit은 canonical 템플릿 섹션을 갖춰야 한다. 섹션을
// 통째로 비운 빈 껍데기가 review/approved/accepted로 통과하는 구멍을 막는다.
// 섹션명은 harness/templates/raw 의 feature-prd.md / feature-adr.md 기준이다.
const REQUIRED_SECTIONS = {
  "prd.md": {
    statuses: new Set(["review", "approved"]),
    sections: ["배경", "목표", "비목표", "요구사항", "수용 기준"],
  },
  "adr.md": {
    statuses: new Set(["accepted"]),
    sections: ["컨텍스트", "결정", "선택지", "선택 근거", "결과", "후속 작업", "검증"],
  },
  // A bugfix.md is the lightweight PRD-equivalent for a bug: it must preserve the
  // symptom, root cause, fix, and regression guard once it has settled.
  "bugfix.md": {
    statuses: new Set(["review", "fixed"]),
    sections: ["증상", "원인", "수정", "회귀 방지"],
  },
};

function assertRequiredSections() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  for (const filePath of listMarkdownFiles(repoPath("docs", "raw"))) {
    const baseName = path.basename(filePath);
    const rule = REQUIRED_SECTIONS[baseName];
    if (!rule) continue;

    const content = readText(filePath);
    const fields = parseFrontmatter(content);
    if (!fields?.status || !rule.statuses.has(fields.status)) continue;

    const relative = toPosix(path.relative(process.cwd(), filePath));
    const body = bodyAfterFrontmatter(content);
    for (const section of rule.sections) {
      if (!new RegExp(`^##\\s+${section}\\s*$`, "m").test(body)) {
        addError(`${baseName} (status ${fields.status}) is missing required section "## ${section}": ${relative}`);
      }
    }
  }
}

function assertPublicSafeDocs() {
  if (harnessRepoMode) return;

  const forbiddenPatterns = [
    /\.omx-config\.json/i,
    /\.reference-repos/i,
    /session-handoff/i,
    /data-source/i,
  ];

  const files = [
    ...listMarkdownFiles(repoPath("docs", "raw")),
    ...listMarkdownFiles(repoPath("docs", "wiki")),
  ];

  for (const filePath of files) {
    const relative = toPosix(path.relative(process.cwd(), filePath));
    const content = readText(filePath);
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        addError(`public docs contain forbidden reference (${pattern}): ${relative}`);
      }
    }
  }
}

function assertStatusTransitions() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  for (const filePath of listMarkdownFiles(repoPath("docs", "raw"))) {
    const baseName = path.basename(filePath);
    if (!["prd.md", "adr.md", "bugfix.md"].includes(baseName)) continue;

    const relativePosix = toPosix(path.relative(REPO_ROOT, filePath));
    const previousContent = gitShow(relativePosix);
    if (!previousContent) continue; // new unit or no git history to compare

    const previous = parseFrontmatter(previousContent);
    const current = parseFrontmatter(readText(filePath));
    if (!previous?.status || !current?.status || previous.status === current.status) continue;

    if (isForbiddenTransition(baseName, previous.status, current.status)) {
      addError(
        `forbidden status transition ${previous.status} -> ${current.status}: ${toPosix(path.relative(process.cwd(), filePath))}`,
      );
    }
  }
}

// state.md는 이 작업 단위의 단계 체크포인트이자 승인 증거다. 이 검사가 (1) 승인
// 이벤트 없는 approved/accepted 차단, (2) state.md ↔ prd/adr status 정합성(승인 축),
// (3) 스테이지 enum과 후진(un-approval) 차단을 기계강제한다. 형식만 맞는 위조가
// 통과하던 구멍을 닫고, 손으로 status만 바꾸면 정합성에서 걸리게 만든다.
function assertStateLedger() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  for (const unitDir of unitDirs("feature")) {
    const rel = toPosix(path.relative(process.cwd(), unitDir));
    const prdPath = path.join(unitDir, "prd.md");
    const adrPath = path.join(unitDir, "adr.md");
    const statePath = path.join(unitDir, "state.md");

    const prdStatus = pathExists(prdPath) ? parseFrontmatter(readText(prdPath))?.status : undefined;
    const adrStatus = pathExists(adrPath) ? parseFrontmatter(readText(adrPath))?.status : undefined;

    if (!pathExists(statePath)) {
      // Hard-require the ledger only where it is load-bearing (an approval
      // happened). Pre-approval units without state.md only get a nudge, so
      // upgrading the harness never breaks a legacy draft unit.
      if (prdStatus === "approved") addError(`approved PRD requires a state.md ledger with an approval event: ${rel}`);
      if (adrStatus === "accepted") addError(`accepted ADR requires a state.md ledger with an approval event: ${rel}`);
      if (prdStatus === "review") {
        console.warn(`[harness:check] WARNING: ${rel} has a review PRD but no state.md checkpoint; run npm run harness:kickoff to create it.`);
      }
      continue;
    }

    const stateContent = readText(statePath);
    const state = parseFrontmatter(stateContent) ?? {};
    const stage = state.stage;

    if (!stage || !STAGE_VALUES.has(stage)) {
      addError(`state.md has an invalid or missing stage "${stage ?? ""}": ${rel}`);
    }

    // Approval-axis consistency (both directions): the ledger and the artifact
    // must agree on approved-ness, catching a hand-flipped status that skipped
    // harness:approve.
    if ((prdStatus === "approved") !== (state.prd_status === "approved")) {
      addError(`state.md prd_status ("${state.prd_status ?? ""}") disagrees with prd.md status ("${prdStatus ?? ""}"): ${rel}`);
    }
    if ((adrStatus === "accepted") !== (state.adr_status === "accepted")) {
      addError(`state.md adr_status ("${state.adr_status ?? ""}") disagrees with adr.md status ("${adrStatus ?? ""}"): ${rel}`);
    }

    // Approval-event backing: an approved/accepted artifact must carry a
    // recorded, quoted approval event in the ledger.
    const events = parseApprovalEvents(stateContent);
    if (prdStatus === "approved" && !events.some((event) => event.target === "prd" && event.quote)) {
      addError(`approved PRD has no matching approval event in state.md: ${rel}`);
    }
    if (adrStatus === "accepted" && !events.some((event) => event.target === "adr" && event.quote)) {
      addError(`accepted ADR has no matching approval event in state.md: ${rel}`);
    }

    // Stage/status coherence: post-approval stages require an approved PRD.
    if (POST_APPROVAL_STAGES.has(stage) && prdStatus !== "approved") {
      addError(`state.md stage "${stage}" requires an approved PRD (prd.md status "${prdStatus ?? ""}"): ${rel}`);
    }

    assertNoStageRegression(statePath, stage, rel);
  }

  // bugfix/chore units keep state.md only as a checkpoint; validate its shape
  // and forbid un-approval regressions, but do not require prd/adr backing.
  for (const type of ["bugfix", "chore"]) {
    for (const unitDir of unitDirs(type)) {
      const statePath = path.join(unitDir, "state.md");
      if (!pathExists(statePath)) continue;

      const rel = toPosix(path.relative(process.cwd(), unitDir));
      const stage = parseFrontmatter(readText(statePath))?.stage;
      if (!stage || !STAGE_VALUES.has(stage)) {
        addError(`state.md has an invalid or missing stage "${stage ?? ""}": ${rel}`);
        continue;
      }
      assertNoStageRegression(statePath, stage, rel);
    }
  }
}

function assertNoStageRegression(statePath, stage, rel) {
  const relativePosix = toPosix(path.relative(REPO_ROOT, statePath));
  const previousContent = gitShow(relativePosix);
  if (!previousContent) return;

  const previousStage = parseFrontmatter(previousContent)?.stage;
  if (previousStage && stage && isForbiddenStageTransition(previousStage, stage)) {
    addError(`forbidden stage regression ${previousStage} -> ${stage}: ${rel}`);
  }
}

// Step separation between $prd-helper and $adr-helper, enforced at git time (the
// non-bypassable backstop to the PreToolUse guard). The ADR must not be authored
// while the unit is still in the PRD phase: if state.md stage is pre-ADR
// (kickoff/prd-draft/prd-review/awaiting-approval), adr.md must remain the kickoff
// skeleton. The ADR-need decision belongs in prd.md "## ADR 필요 여부"; the ADR body
// is authored only after $adr-helper advances the stage to adr-draft.
function assertAdrPhaseGate() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  const skeleton = skeletonAdrBody();
  for (const unitDir of unitDirs("feature")) {
    const statePath = path.join(unitDir, "state.md");
    const adrPath = path.join(unitDir, "adr.md");
    if (!pathExists(statePath) || !pathExists(adrPath)) continue;

    const stage = parseFrontmatter(readText(statePath))?.stage;
    if (!isPreAdrStage(stage)) continue;

    if (adrBodyLooksAuthored(readText(adrPath), skeleton)) {
      const rel = toPosix(path.relative(process.cwd(), unitDir));
      addError(
        `ADR authored during the PRD phase (state.md stage "${stage}"): ${rel}. ` +
          `Keep the ADR-need decision in prd.md "## ADR 필요 여부" and leave adr.md as the kickoff skeleton; ` +
          `author adr.md only after entering $adr-helper (advance state.md stage to adr-draft).`,
      );
    }
  }
}

// ADR frontmatter의 related_prd/supersedes가 실제 파일을 가리키는지 검증한다.
// assertWikiLinks와 같은 클래스의 link-resolution 게이트다. 값이 비어 있으면
// 건너뛴다(supersedes는 비어 있는 게 정상이다). 경로는 ADR 디렉토리 기준이다.
// prd.md frontmatter의 parent_prd가 실제 파일을 가리키는지 검증(assertAdrReferences와
// 같은 클래스의 link-resolution 게이트). 비어 있으면 skip(대부분 정상). 상위 계약(부모
// PRD)을 세부화하는 후속 feature가 frontmatter로 계보를 잇게 한다.
function assertPrdReferences() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  for (const filePath of listMarkdownFiles(repoPath("docs", "raw"))) {
    if (path.basename(filePath) !== "prd.md") continue;

    const value = parseFrontmatter(readText(filePath))?.parent_prd;
    if (!value) continue;

    const relative = toPosix(path.relative(process.cwd(), filePath));
    if (!pathExists(path.resolve(path.dirname(filePath), value))) {
      addError(`prd.md parent_prd points to a missing file (${value}): ${relative}`);
    }
  }
}

function assertAdrReferences() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  for (const filePath of listMarkdownFiles(repoPath("docs", "raw"))) {
    if (path.basename(filePath) !== "adr.md") continue;

    const fields = parseFrontmatter(readText(filePath));
    if (!fields) continue;

    const relative = toPosix(path.relative(process.cwd(), filePath));
    const dir = path.dirname(filePath);
    for (const key of ["related_prd", "supersedes"]) {
      const value = fields[key];
      if (!value) continue;
      if (!pathExists(path.resolve(dir, value))) {
        addError(`adr.md ${key} points to a missing file (${value}): ${relative}`);
      }
    }
  }
}

// accepted/deprecated/superseded ADR은 과거 결정의 근거다. status/approval 같은
// frontmatter는 바꿀 수 있어도 본문은 고쳐 쓰지 않는다. 이전 커밋이 이미 불변
// 상태였는데 본문이 바뀌면 막는다(결정이 바뀌면 superseding ADR을 추가한다).
function assertImmutableAdrBody() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "raw"))) return;

  const immutableStatuses = new Set(["accepted", "deprecated", "superseded"]);
  for (const filePath of listMarkdownFiles(repoPath("docs", "raw"))) {
    if (path.basename(filePath) !== "adr.md") continue;

    const relativePosix = toPosix(path.relative(REPO_ROOT, filePath));
    const previousContent = gitShow(relativePosix);
    if (!previousContent) continue; // new ADR or no git history to compare

    const previous = parseFrontmatter(previousContent);
    if (!previous?.status || !immutableStatuses.has(previous.status)) continue;

    if (bodyAfterFrontmatter(previousContent).trim() !== bodyAfterFrontmatter(readText(filePath)).trim()) {
      addError(
        `accepted/deprecated/superseded ADR body must not change; record a superseding ADR instead: ${toPosix(path.relative(process.cwd(), filePath))}`,
      );
    }
  }
}

function assertHarnessAdapters() {
  const roleDir = harnessPath("harness", "roles");
  const roleFiles = fs
    .readdirSync(roleDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.basename(entry, ".md"));

  for (const roleName of roleFiles) {
    // Codex loads the .toml at runtime and the .md is the readable mirror; both
    // are required so a half-deleted or stale pair cannot pass silently.
    for (const codexAdapter of [
      rootAdapterPath(".codex", "agents", `${roleName}.md`),
      rootAdapterPath(".codex", "agents", `${roleName}.toml`),
    ]) {
      if (!pathExists(codexAdapter)) {
        addError(`missing Codex agent adapter: ${toPosix(path.relative(process.cwd(), codexAdapter))}`);
      }
    }

    const claudeAdapter = rootAdapterPath(".claude", "agents", `${roleName}.md`);
    if (!pathExists(claudeAdapter)) {
      addError(`missing ClaudeCode agent adapter for harness role: ${roleName}`);
    }
  }

  const requiredSurfaces = [
    {
      name: "next feature",
      codex: [rootAdapterPath(".codex", "skills", "next-feature", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "next-feature", "SKILL.md")],
    },
    {
      name: "artifact validation",
      codex: [rootAdapterPath(".codex", "skills", "artifact-validation", "SKILL.md")],
      claude: [
        rootAdapterPath(".claude", "skills", "artifact-validation", "SKILL.md"),
        rootAdapterPath(".claude", "commands", "artifact-check.md"),
      ],
    },
    {
      name: "commit protocol",
      codex: [rootAdapterPath(".codex", "skills", "commit-protocol", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "commit-protocol", "SKILL.md")],
    },
    {
      name: "feature develop",
      codex: [rootAdapterPath(".codex", "skills", "feature-develop", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "feature-develop", "SKILL.md")],
    },
    {
      name: "prd helper",
      codex: [rootAdapterPath(".codex", "skills", "prd-helper", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "prd-helper", "SKILL.md")],
    },
    {
      name: "adr helper",
      codex: [rootAdapterPath(".codex", "skills", "adr-helper", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "adr-helper", "SKILL.md")],
    },
    {
      name: "kickoff",
      codex: [rootAdapterPath(".codex", "skills", "kickoff", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "kickoff", "SKILL.md"), rootAdapterPath(".claude", "commands", "kickoff.md")],
    },
    {
      name: "submodule attach",
      codex: [rootAdapterPath(".codex", "skills", "submodule-attach", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "submodule-attach", "SKILL.md")],
    },
    {
      name: "ui verification",
      codex: [rootAdapterPath(".codex", "skills", "ui-verification", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "ui-verification", "SKILL.md")],
    },
    {
      name: "wiki ingest",
      codex: [rootAdapterPath(".codex", "skills", "wiki-ingest", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "wiki-ingest", "SKILL.md"), rootAdapterPath(".claude", "commands", "wiki-ingest.md")],
    },
  ];

  // Each listed entry is a distinct runtime entrypoint (e.g. a skill and a
  // command are not interchangeable), so require every one rather than any.
  for (const surface of requiredSurfaces) {
    for (const codexPath of surface.codex) {
      if (!pathExists(codexPath)) addError(`missing Codex adapter for ${surface.name}: ${toPosix(path.relative(process.cwd(), codexPath))}`);
    }
    for (const claudePath of surface.claude) {
      if (!pathExists(claudePath)) addError(`missing ClaudeCode adapter for ${surface.name}: ${toPosix(path.relative(process.cwd(), claudePath))}`);
    }
  }
}

function tomlDeveloperInstructions(content) {
  const match = /developer_instructions\s*=\s*"""\r?\n?([\s\S]*?)"""/.exec(content);
  return match ? match[1] : null;
}

// Adapters are hand-maintained mirrors; verify the Codex and ClaudeCode copies
// have not drifted apart (and that a Codex .toml still matches its .md). Runs in
// harness-provider mode only, so a consumer project's local override adapters
// are never compared.
function assertAdapterParity() {
  if (!harnessRepoMode) return;

  const roleNames = fs
    .readdirSync(harnessPath("harness", "roles"))
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.basename(entry, ".md"));

  for (const roleName of roleNames) {
    const codexMd = rootAdapterPath(".codex", "agents", `${roleName}.md`);
    const claudeMd = rootAdapterPath(".claude", "agents", `${roleName}.md`);
    if (pathExists(codexMd) && pathExists(claudeMd) && readText(codexMd).trim() !== readText(claudeMd).trim()) {
      addError(`Codex and ClaudeCode agent adapters diverged: ${roleName}`);
    }

    const tomlPath = rootAdapterPath(".codex", "agents", `${roleName}.toml`);
    if (pathExists(tomlPath) && pathExists(codexMd)) {
      const tomlBody = tomlDeveloperInstructions(readText(tomlPath));
      if (tomlBody !== null && tomlBody.trim() !== bodyAfterFrontmatter(readText(codexMd)).trim()) {
        addError(`Codex .toml developer_instructions diverged from the .md adapter: ${roleName}`);
      }
    }
  }

  const codexSkillsDir = rootAdapterPath(".codex", "skills");
  if (!pathExists(codexSkillsDir)) return;

  for (const skillName of fs.readdirSync(codexSkillsDir)) {
    const codexSkill = path.join(codexSkillsDir, skillName, "SKILL.md");
    const claudeSkill = rootAdapterPath(".claude", "skills", skillName, "SKILL.md");
    if (!pathExists(codexSkill) || !pathExists(claudeSkill)) continue;

    // The ClaudeCode skill may append an optional "## Claude Code ..." section
    // (Claude-native execution notes); the rest must match the Codex skill
    // (modulo trailing whitespace).
    const claudeContent = readText(claudeSkill);
    const accelIndex = claudeContent.indexOf("## Claude Code");
    const claudeBase = accelIndex === -1 ? claudeContent : claudeContent.slice(0, accelIndex);
    if (claudeBase.trim() !== readText(codexSkill).trim()) {
      addError(`Codex and ClaudeCode skill adapters diverged: ${skillName}`);
    }
  }
}

assertHarnessShape();
assertNoHarnessDocsNamespace();
assertProjectDocsPresent();
assertHarnessSync();
assertWikiShape();
assertWikiLinks();
assertWikiFeatureTaxonomy();
assertSectionLayout();
assertAreaField();
assertAreaGrouping();
assertAreaTimeline();
assertAreaCurrency();
assertRawUnits();
assertRawUnitsLinked();
assertCurrentBranchRawUnit();
assertFrontmatter();
assertNoPlaceholders();
assertRequiredSections();
assertStatusTransitions();
assertStateLedger();
assertAdrPhaseGate();
assertPrdReferences();
assertAdrReferences();
assertImmutableAdrBody();
assertPublicSafeDocs();
assertHarnessAdapters();
assertAdapterParity();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[harness:check] error: ${error}`);
  }
  fail(`${errors.length} artifact issue(s) found`);
}

console.log(`[harness:check] ok (${harnessRepoMode ? "harness" : "project"} mode)`);
