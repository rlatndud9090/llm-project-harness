#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  fail,
  getCurrentBranch,
  listMarkdownFiles,
  parseFrontmatter,
  parseWorkBranch,
  pathExists,
  readText,
  repoPath,
  toPosix,
} from "./lib.mjs";

const errors = [];

function addError(message) {
  errors.push(message);
}

function assertWikiShape() {
  const wikiDir = repoPath("docs", "wiki");
  const entries = fs.readdirSync(wikiDir).filter((entry) => !entry.startsWith("."));
  const unexpected = entries.filter((entry) => entry !== "index.md");
  if (unexpected.length > 0) {
    addError(`docs/wiki must contain only index.md; found ${unexpected.join(", ")}`);
  }
}

function assertWikiLinks() {
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
  const files = listMarkdownFiles(repoPath("docs", "raw")).filter((filePath) => !filePath.includes(`${path.sep}_templates${path.sep}`));
  const required = ["title", "date", "status", "unit_type"];

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

    const expectedType = relative.split("/")[2];
    if (fields.unit_type && fields.unit_type !== expectedType) {
      addError(`frontmatter unit_type must be ${expectedType}: ${relative}`);
    }
  }
}

function assertPublicSafeDocs() {
  const forbiddenPatterns = [
    /pokemon showdown/i,
    /pokerogue/i,
    /pokemantle/i,
    /\.omx-config\.json/i,
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

function assertHarnessAdapters() {
  const roleDir = repoPath("docs", "harness", "roles");
  const roleFiles = fs
    .readdirSync(roleDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.basename(entry, ".md"));

  for (const roleName of roleFiles) {
    for (const toolDir of [".codex", ".claude"]) {
      const adapterPath = repoPath(toolDir, "agents", `${roleName}.md`);
      if (!pathExists(adapterPath)) {
        addError(`missing ${toolDir} agent adapter for harness role: ${roleName}`);
      }
    }
  }

  const requiredSurfaces = [
    {
      name: "artifact validation",
      codex: [repoPath(".codex", "skills", "artifact-check", "SKILL.md")],
      claude: [
        repoPath(".claude", "skills", "artifact-validation", "SKILL.md"),
        repoPath(".claude", "commands", "artifact-check.md"),
      ],
    },
    {
      name: "commit protocol",
      codex: [repoPath(".codex", "skills", "commit-protocol", "SKILL.md")],
      claude: [repoPath(".claude", "skills", "commit-protocol", "SKILL.md")],
    },
    {
      name: "feature develop",
      codex: [repoPath(".codex", "skills", "feature-develop", "SKILL.md")],
      claude: [repoPath(".claude", "skills", "feature-develop", "SKILL.md")],
    },
    {
      name: "prd drafting",
      codex: [repoPath(".codex", "skills", "prd-drafting", "SKILL.md")],
      claude: [repoPath(".claude", "skills", "prd-drafting", "SKILL.md")],
    },
    {
      name: "raw start",
      codex: [repoPath(".codex", "skills", "raw-start", "SKILL.md")],
      claude: [repoPath(".claude", "skills", "raw-start", "SKILL.md"), repoPath(".claude", "commands", "raw-start.md")],
    },
    {
      name: "ui verification",
      codex: [repoPath(".codex", "skills", "ui-verification", "SKILL.md")],
      claude: [repoPath(".claude", "skills", "ui-verification", "SKILL.md")],
    },
    {
      name: "wiki ingest",
      codex: [repoPath(".codex", "skills", "wiki-ingest", "SKILL.md")],
      claude: [repoPath(".claude", "skills", "wiki-ingest", "SKILL.md"), repoPath(".claude", "commands", "wiki-ingest.md")],
    },
    {
      name: "work intake",
      codex: [repoPath(".codex", "skills", "work-intake", "SKILL.md")],
      claude: [repoPath(".claude", "skills", "work-intake", "SKILL.md")],
    },
  ];

  for (const surface of requiredSurfaces) {
    if (!surface.codex.some(pathExists)) addError(`missing Codex adapter for harness surface: ${surface.name}`);
    if (!surface.claude.some(pathExists)) addError(`missing ClaudeCode adapter for harness surface: ${surface.name}`);
  }
}

assertWikiShape();
assertWikiLinks();
assertRawUnits();
assertRawUnitsLinked();
assertCurrentBranchRawUnit();
assertFrontmatter();
assertPublicSafeDocs();
assertHarnessAdapters();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[harness:check] error: ${error}`);
  }
  fail(`${errors.length} artifact issue(s) found`);
}

console.log("[harness:check] ok");
