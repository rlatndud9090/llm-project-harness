#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
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
    harnessPath("scripts", "harness", "raw-start.mjs"),
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

function assertHarnessAdapters() {
  const roleDir = harnessPath("harness", "roles");
  const roleFiles = fs
    .readdirSync(roleDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.basename(entry, ".md"));

  for (const roleName of roleFiles) {
    const codexAdapters = [
      rootAdapterPath(".codex", "agents", `${roleName}.md`),
      rootAdapterPath(".codex", "agents", `${roleName}.toml`),
    ];
    if (!codexAdapters.some(pathExists)) {
      addError(`missing Codex agent adapter for harness role: ${roleName}`);
    }

    const claudeAdapter = rootAdapterPath(".claude", "agents", `${roleName}.md`);
    if (!pathExists(claudeAdapter)) {
      addError(`missing ClaudeCode agent adapter for harness role: ${roleName}`);
    }
  }

  const requiredSurfaces = [
    {
      name: "do next",
      codex: [rootAdapterPath(".codex", "skills", "do-next", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "do-next", "SKILL.md")],
      generic: [rootAdapterPath(".agents", "skills", "do-next", "SKILL.md")],
    },
    {
      name: "artifact validation",
      codex: [rootAdapterPath(".codex", "skills", "artifact-validation", "SKILL.md")],
      claude: [
        rootAdapterPath(".claude", "skills", "artifact-validation", "SKILL.md"),
        rootAdapterPath(".claude", "commands", "artifact-check.md"),
      ],
      generic: [rootAdapterPath(".agents", "skills", "artifact-validation", "SKILL.md")],
    },
    {
      name: "commit protocol",
      codex: [rootAdapterPath(".codex", "skills", "commit-protocol", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "commit-protocol", "SKILL.md")],
      generic: [rootAdapterPath(".agents", "skills", "commit-protocol", "SKILL.md")],
    },
    {
      name: "feature develop",
      codex: [rootAdapterPath(".codex", "skills", "feature-develop", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "feature-develop", "SKILL.md")],
      generic: [rootAdapterPath(".agents", "skills", "feature-develop", "SKILL.md")],
    },
    {
      name: "prd drafting",
      codex: [rootAdapterPath(".codex", "skills", "prd-drafting", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "prd-drafting", "SKILL.md")],
      generic: [rootAdapterPath(".agents", "skills", "prd-drafting", "SKILL.md")],
    },
    {
      name: "raw start",
      codex: [rootAdapterPath(".codex", "skills", "raw-start", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "raw-start", "SKILL.md"), rootAdapterPath(".claude", "commands", "raw-start.md")],
      generic: [rootAdapterPath(".agents", "skills", "raw-start", "SKILL.md")],
    },
    {
      name: "submodule attach",
      codex: [rootAdapterPath(".codex", "skills", "submodule-attach", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "submodule-attach", "SKILL.md")],
      generic: [rootAdapterPath(".agents", "skills", "submodule-attach", "SKILL.md")],
    },
    {
      name: "ui verification",
      codex: [rootAdapterPath(".codex", "skills", "ui-verification", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "ui-verification", "SKILL.md")],
      generic: [rootAdapterPath(".agents", "skills", "ui-verification", "SKILL.md")],
    },
    {
      name: "wiki ingest",
      codex: [rootAdapterPath(".codex", "skills", "wiki-ingest", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "wiki-ingest", "SKILL.md"), rootAdapterPath(".claude", "commands", "wiki-ingest.md")],
      generic: [rootAdapterPath(".agents", "skills", "wiki-ingest", "SKILL.md")],
    },
    {
      name: "work intake",
      codex: [rootAdapterPath(".codex", "skills", "work-intake", "SKILL.md")],
      claude: [rootAdapterPath(".claude", "skills", "work-intake", "SKILL.md")],
      generic: [rootAdapterPath(".agents", "skills", "work-intake", "SKILL.md")],
    },
  ];

  for (const surface of requiredSurfaces) {
    if (!surface.codex.some(pathExists)) addError(`missing Codex adapter for harness surface: ${surface.name}`);
    if (!surface.claude.some(pathExists)) addError(`missing ClaudeCode adapter for harness surface: ${surface.name}`);
    if (!surface.generic.some(pathExists)) addError(`missing generic agent adapter for harness surface: ${surface.name}`);
  }

  assertDoNextCompatibilityAdapters();
}

function assertDoNextCompatibilityAdapters() {
  const compatibilityAdapters = [
    rootAdapterPath(".codex", "skills", "work-intake", "SKILL.md"),
    rootAdapterPath(".claude", "skills", "work-intake", "SKILL.md"),
    rootAdapterPath(".agents", "skills", "work-intake", "SKILL.md"),
    rootAdapterPath(".codex", "skills", "prd-drafting", "SKILL.md"),
    rootAdapterPath(".claude", "skills", "prd-drafting", "SKILL.md"),
    rootAdapterPath(".agents", "skills", "prd-drafting", "SKILL.md"),
  ];

  for (const adapterPath of compatibilityAdapters) {
    const relative = toPosix(path.relative(process.cwd(), adapterPath));
    if (!pathExists(adapterPath)) {
      addError(`missing do-next compatibility adapter: ${relative}`);
      continue;
    }

    if (isProjectLocalOverride(adapterPath)) {
      continue;
    }

    const content = readText(adapterPath);
    if (!content.includes("$do-next")) {
      addError(`compatibility adapter must route new work through $do-next: ${relative}`);
    }
  }
}

function isProjectLocalOverride(adapterPath) {
  if (harnessRepoMode) return false;

  try {
    const stats = fs.lstatSync(adapterPath);
    if (!stats.isSymbolicLink()) return true;

    const resolvedAdapter = fs.realpathSync(adapterPath);
    const resolvedHarness = fs.realpathSync(harnessRoot);
    return !resolvedAdapter.startsWith(`${resolvedHarness}${path.sep}`);
  } catch {
    return false;
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
assertStatusTransitions();
assertPublicSafeDocs();
assertHarnessAdapters();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[harness:check] error: ${error}`);
  }
  fail(`${errors.length} artifact issue(s) found`);
}

console.log(`[harness:check] ok (${harnessRepoMode ? "harness" : "project"} mode)`);
