#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  bodyAfterFrontmatter,
  fail,
  findHarnessRoot,
  getCurrentBranch,
  gitShow,
  isForbiddenTransition,
  isHarnessRepository,
  listMarkdownFiles,
  parseFrontmatter,
  parseWorkBranch,
  pathExists,
  readText,
  repoPath,
  toPosix,
} from "./lib.mjs";

const errors = [];
const harnessRoot = findHarnessRoot();
const harnessRepoMode = isHarnessRepository();

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

function assertWikiShape() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki"))) return;

  const wikiDir = repoPath("docs", "wiki");
  const entries = fs.readdirSync(wikiDir).filter((entry) => !entry.startsWith("."));
  const unexpected = entries.filter((entry) => entry !== "index.md");
  if (unexpected.length > 0) {
    addError(`docs/wiki must contain only index.md; found ${unexpected.join(", ")}`);
  }
}

function assertWikiLinks() {
  if (harnessRepoMode || !pathExists(repoPath("docs", "wiki", "index.md"))) return;

  const wikiPath = repoPath("docs", "wiki", "index.md");
  const wiki = readText(wikiPath);
  const links = [...wiki.matchAll(/\]\((\.\.\/raw\/[^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    const target = path.resolve(path.dirname(wikiPath), link);
    if (!pathExists(target)) {
      addError(`broken wiki raw link: ${link}`);
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

  const wiki = readText(repoPath("docs", "wiki", "index.md"));
  for (const type of ["feature", "bugfix", "chore"]) {
    for (const unitDir of unitDirs(type)) {
      const markdownFiles = fs
        .readdirSync(unitDir)
        .filter((entry) => entry.endsWith(".md"))
        .map((entry) => path.join(unitDir, entry));

      const hasWikiLink = markdownFiles.some((filePath) => {
        const relative = toPosix(path.relative(repoPath("docs", "wiki"), filePath));
        return wiki.includes(`](${relative})`);
      });

      if (!hasWikiLink) {
        addError(`raw unit is not linked from docs/wiki/index.md: ${toPosix(path.relative(process.cwd(), unitDir))}`);
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
  const allowedStatuses = {
    "prd.md": new Set(["draft", "review", "approved", "rejected"]),
    "adr.md": new Set(["proposed", "accepted", "deprecated", "superseded"]),
    "bugfix.md": new Set(["draft", "review", "fixed", "rejected"]),
    "chore.md": new Set(["draft", "done", "rejected"]),
  };

  for (const filePath of files) {
    const baseName = path.basename(filePath);
    if (!["prd.md", "adr.md", "bugfix.md", "chore.md"].includes(baseName)) continue;

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

    const tokenMatch = body.match(/\{[^}\n]{1,40}\}/);
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
    if (!["prd.md", "adr.md", "bugfix.md", "chore.md"].includes(baseName)) continue;

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

// ADR frontmatter의 related_prd/supersedes가 실제 파일을 가리키는지 검증한다.
// assertWikiLinks와 같은 클래스의 link-resolution 게이트다. 값이 비어 있으면
// 건너뛴다(supersedes는 비어 있는 게 정상이다). 경로는 ADR 디렉토리 기준이다.
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
assertWikiShape();
assertWikiLinks();
assertRawUnits();
assertRawUnitsLinked();
assertCurrentBranchRawUnit();
assertFrontmatter();
assertNoPlaceholders();
assertStatusTransitions();
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
