#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const args = parseArgs(process.argv.slice(2));
const harnessRoot = path.resolve(projectRoot, args["harness-dir"] ?? autoHarnessRoot(scriptPath));
const dryRun = Boolean(args["dry-run"]);
const force = Boolean(args.force);
const retrofit = Boolean(args.retrofit);
const prune = !args["no-prune"];
const jsonOutput = Boolean(args.json);
const reportPath = typeof args.report === "string" ? path.resolve(projectRoot, args.report) : null;
const updatePackageScripts = !args["no-package-scripts"];

if (sameRealPath(projectRoot, harnessRoot)) {
  fail("run this from a consuming project root, not from the harness repository root");
}

if (!exists(path.join(harnessRoot, "harness", "protocols"))) {
  fail(`harness root does not look valid: ${harnessRoot}`);
}

const operations = [];
const warnings = [];
const conflicts = [];

const ADAPTER_DIRS = [
  [".codex", "agents"],
  [".codex", "skills"],
  [".claude", "agents"],
  [".claude", "commands"],
  [".claude", "skills"],
];
const PRUNE_ADAPTER_DIRS = [...ADAPTER_DIRS, [".agents", "skills"]];

for (const [toolDir, childDir] of ADAPTER_DIRS) linkChildren(toolDir, childDir);
for (const [toolDir, childDir] of PRUNE_ADAPTER_DIRS) pruneStaleLinks(toolDir, childDir);
if (prune) pruneEmptyLegacyAdapterDirs();

ensureProjectDocs();
if (updatePackageScripts) ensurePackageScripts();
writeReport();

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        mode: retrofit ? "retrofit" : "attach",
        dryRun,
        prune,
        operations,
        warnings,
        conflicts,
      },
      null,
      2,
    ),
  );
} else if (dryRun) {
  for (const operation of operations) console.log(`[dry-run] ${operation}`);
  printDiagnostics();
  console.log(`[attach-submodule] ${retrofit ? "retrofit " : ""}dry run complete`);
} else {
  console.log(`[attach-submodule] ${retrofit ? "retrofit " : ""}ok`);
  for (const operation of operations) console.log(`- ${operation}`);
  printDiagnostics();
}

function linkChildren(toolDir, childDir) {
  const sourceDir = path.join(harnessRoot, toolDir, childDir);
  if (!exists(sourceDir)) return;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const source = path.join(sourceDir, entry.name);
    const link = path.join(projectRoot, toolDir, childDir, entry.name);
    linkAdapterPath(source, link, entry.isDirectory() ? "dir" : "file");
  }
}

function pruneStaleLinks(toolDir, childDir) {
  const dir = path.join(projectRoot, toolDir, childDir);
  if (!exists(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const link = path.join(dir, entry.name);
    if (!isStaleHarnessLink(link)) continue;

    if (prune) {
      operations.push(`remove stale harness link ${relative(link)}`);
      if (!dryRun) fs.rmSync(link, { recursive: true, force: true });
    } else {
      operations.push(`stale harness link ${relative(link)} (kept; --no-prune set)`);
      warnings.push(`stale harness link ${relative(link)}: target no longer exists in the harness; re-run without --no-prune to remove`);
    }
  }
}

function pruneEmptyLegacyAdapterDirs() {
  for (const directory of [path.join(projectRoot, ".agents", "skills"), path.join(projectRoot, ".agents")]) {
    if (!isEmptyDirectory(directory)) continue;

    operations.push(`remove empty legacy adapter dir ${relative(directory)}`);
    if (!dryRun) fs.rmdirSync(directory);
  }
}

function isEmptyDirectory(directory) {
  try {
    const stats = fs.lstatSync(directory);
    return stats.isDirectory() && fs.readdirSync(directory).length === 0;
  } catch {
    return false;
  }
}

// A link is safe to prune only when it is a symlink that points inside the
// harness (something a previous attach created) AND its target no longer
// exists. Local files and overrides that point outside the harness are left
// untouched so renamed/removed harness adapters can be cleaned up without
// risking project-owned definitions.
function isStaleHarnessLink(link) {
  let stats;
  try {
    stats = fs.lstatSync(link);
  } catch {
    return false;
  }
  if (!stats.isSymbolicLink()) return false;

  let rawTarget;
  try {
    rawTarget = fs.readlinkSync(link);
  } catch {
    return false;
  }

  const resolved = path.resolve(path.dirname(link), rawTarget);
  const harnessAbs = path.resolve(harnessRoot);
  const insideHarness = resolved === harnessAbs || resolved.startsWith(`${harnessAbs}${path.sep}`);
  if (!insideHarness) return false;

  return !fs.existsSync(link); // existsSync follows the link; a missing target means stale
}

function linkAdapterPath(target, link, type) {
  if (exists(link) && !isExpectedSymlink(link, target) && !force) {
    operations.push(`kept local override ${relative(link)}`);
    conflicts.push(`local adapter override: ${relative(link)}`);
    if (retrofit) {
      const fallback = fallbackAdapterPath(link);
      if (exists(fallback) && !isExpectedSymlink(fallback, target) && !force) {
        operations.push(`kept local fallback override ${relative(fallback)}`);
        conflicts.push(`local fallback adapter override: ${relative(fallback)}`);
        warnings.push(`manual adapter merge needed for ${relative(link)}; fallback ${relative(fallback)} already exists`);
      } else {
        operations.push(`add harness fallback ${relative(fallback)} for ${relative(link)}`);
        linkPath(target, fallback, type);
      }
    }
    return;
  }

  linkPath(target, link, type);
}

function fallbackAdapterPath(link) {
  const directory = path.dirname(link);
  const baseName = path.basename(link);
  const extension = path.extname(baseName);
  const stem = extension ? baseName.slice(0, -extension.length) : baseName;
  const fallbackName = `${stem.startsWith("harness-") ? stem : `harness-${stem}`}${extension}`;
  return path.join(directory, fallbackName);
}

function linkPath(target, link, type) {
  if (exists(link)) {
    if (isExpectedSymlink(link, target)) {
      operations.push(`kept ${relative(link)} -> ${readlink(link)}`);
      return;
    }

    if (!force) {
      fail(`path exists and is not the expected harness link: ${relative(link)} (use --force to replace)`);
    }

    removePath(link);
  }

  const relativeTarget = toPortableRelative(path.dirname(link), target);
  operations.push(`link ${relative(link)} -> ${relativeTarget}`);

  if (dryRun) return;

  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(relativeTarget, link, type);
}

function ensureProjectDocs() {
  ensureDirectory(path.join(projectRoot, "docs", "raw"));
  ensureDirectory(path.join(projectRoot, "docs", "wiki"));

  ensureFileOrMarker(
    path.join(projectRoot, "docs", "wiki", "index.md"),
    readHarnessTemplate("wiki", "index.md"),
    "LLM-HARNESS:WIKI",
    `## Harness Maintenance

- 새 raw work unit은 \`docs/raw/{feature,bugfix,chore}/branch-slug/\` 아래에 둔다.
- raw unit을 추가하면 \`npm run harness:ingest -- docs/raw/<type>/<slug> --category "<분류>"\`를 실행한다.
- 기존 문서는 강제로 이동하지 않는다. 새 작업부터 raw/wiki 규칙을 적용한다.
`,
  );

  ensureFile(
    path.join(projectRoot, "docs", "raw", "README.md"),
    `# Raw Sources

이 디렉터리는 이 프로젝트의 raw PRD/ADR/notes를 저장한다.
공용 템플릿은 \`.harness/harness/templates/raw\`에서 제공된다.
`,
  );

  ensureFileOrMarker(
    path.join(projectRoot, "AGENTS.md"),
    `# Project Agent Guide

This project uses the shared LLM Project Harness mounted at \`.harness\`.
Answer in Korean by default unless the user asks otherwise.

## Project Intent

TODO: describe this product.

## Harness Entry Points

1. Read \`docs/wiki/index.md\`.
2. Read \`.harness/harness/protocols/session-start.md\`.
3. Follow only raw links relevant to the task.
4. Use \`$next-feature\` for open-ended product work.
5. Keep product-specific decisions in this project's \`docs/raw/\` and \`docs/wiki/\`.

Shared harness rules live in \`.harness/harness/\`. Root-level \`.codex/\`
and \`.claude/\` may contain symlinks to shared harness adapters plus
project-local skills or agents. Local project definitions are allowed and take
precedence when they occupy the same path.
`,
    "LLM-HARNESS",
    `## LLM Project Harness

This project uses the shared LLM Project Harness mounted at \`.harness\`.

- Read \`docs/wiki/index.md\` first when starting project work.
- Read \`.harness/harness/protocols/session-start.md\` for the shared workflow.
- Keep project-specific decisions in this project's \`docs/raw/\` and \`docs/wiki/\`.
- Root-level \`.codex/\` and \`.claude/\` may contain shared harness links plus project-local skills or agents.
- Local project definitions take precedence when they occupy the same path.
`,
  );
}

function ensurePackageScripts() {
  const packagePath = path.join(projectRoot, "package.json");
  const desiredScripts = {
    "harness:kickoff": "node .harness/scripts/harness/kickoff.mjs",
    "harness:approve": "node .harness/scripts/harness/approve.mjs",
    "harness:ingest": "node .harness/scripts/harness/wiki-ingest.mjs",
    "harness:check": "node .harness/scripts/harness/artifact-check.mjs",
    "harness:gate": "node .harness/scripts/harness/gate.mjs",
    "harness:hooks": "node .harness/scripts/harness/install-hooks.mjs",
  };
  const legacyScripts = {
    "harness:kickoff": "node scripts/harness/kickoff.mjs",
    "harness:approve": "node scripts/harness/approve.mjs",
    "harness:ingest": "node scripts/harness/wiki-ingest.mjs",
    "harness:check": "node scripts/harness/artifact-check.mjs",
    "harness:gate": "node scripts/harness/gate.mjs",
    "harness:hooks": "node scripts/harness/install-hooks.mjs",
  };
  const fallbackScripts = Object.fromEntries(
    Object.entries(desiredScripts).map(([name, command]) => [name.replace(/^harness:/, "llm-harness:"), command]),
  );

  let packageJson;
  if (exists(packagePath)) {
    packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } else {
    packageJson = {
      private: true,
      type: "module",
      scripts: {},
    };
  }

  packageJson.scripts ??= {};

  let changed = false;
  for (const [name, command] of Object.entries(desiredScripts)) {
    if (packageJson.scripts[name] === command) continue;
    if (packageJson.scripts[name] && packageJson.scripts[name] !== legacyScripts[name] && !force) {
      operations.push(`kept package script ${name}: ${packageJson.scripts[name]}`);
      conflicts.push(`package script override: ${name}`);
      if (retrofit) {
        const fallbackName = name.replace(/^harness:/, "llm-harness:");
        if (!packageJson.scripts[fallbackName]) {
          packageJson.scripts[fallbackName] = fallbackScripts[fallbackName];
          changed = true;
          operations.push(`set package script ${fallbackName}`);
          warnings.push(`use npm run ${fallbackName} for shared harness because ${name} already exists`);
        } else if (packageJson.scripts[fallbackName] !== fallbackScripts[fallbackName]) {
          operations.push(`kept package script ${fallbackName}: ${packageJson.scripts[fallbackName]}`);
          conflicts.push(`package fallback script override: ${fallbackName}`);
          warnings.push(`manual package script merge needed for ${fallbackName}; ${name} already exists`);
        } else {
          operations.push(`kept package script ${fallbackName}: ${packageJson.scripts[fallbackName]}`);
        }
      }
      continue;
    }
    packageJson.scripts[name] = command;
    changed = true;
    operations.push(`set package script ${name}`);
  }

  if (!changed) return;
  if (dryRun) return;

  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

function ensureDirectory(directory) {
  if (exists(directory)) return;
  operations.push(`mkdir ${relative(directory)}`);
  if (!dryRun) fs.mkdirSync(directory, { recursive: true });
}

function ensureFile(filePath, content) {
  if (exists(filePath)) {
    operations.push(`kept ${relative(filePath)}`);
    return;
  }

  operations.push(`create ${relative(filePath)}`);
  if (dryRun) return;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function readHarnessTemplate(...parts) {
  return fs.readFileSync(path.join(harnessRoot, "harness", "templates", ...parts), "utf8");
}

function ensureFileOrMarker(filePath, content, markerName, markerContent) {
  if (!exists(filePath)) {
    ensureFile(filePath, content);
    return;
  }

  if (!retrofit) {
    operations.push(`kept ${relative(filePath)}`);
    return;
  }

  const current = fs.readFileSync(filePath, "utf8");
  const next = upsertMarkerBlock(current, markerName, markerContent);
  if (next === current) {
    operations.push(`kept ${relative(filePath)} marker ${markerName}`);
    return;
  }

  operations.push(`update ${relative(filePath)} marker ${markerName}`);
  if (!dryRun) fs.writeFileSync(filePath, next, "utf8");
}

function upsertMarkerBlock(content, markerName, markerContent) {
  const start = `<!-- ${markerName}:START -->`;
  const end = `<!-- ${markerName}:END -->`;
  const block = `${start}\n${markerContent.trim()}\n${end}`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);

  if (pattern.test(content)) {
    return content.replace(pattern, block);
  }

  return `${content.trimEnd()}\n\n${block}\n`;
}

function isExpectedSymlink(link, target) {
  try {
    const stats = fs.lstatSync(link);
    if (!stats.isSymbolicLink()) return false;
    return path.resolve(path.dirname(link), fs.readlinkSync(link)) === path.resolve(target);
  } catch {
    return false;
  }
}

function readlink(link) {
  try {
    return fs.readlinkSync(link);
  } catch {
    return "";
  }
}

function removePath(filePath) {
  operations.push(`replace ${relative(filePath)}`);
  if (!dryRun) fs.rmSync(filePath, { recursive: true, force: true });
}

function writeReport() {
  if (!reportPath) return;

  operations.push(`${dryRun ? "would write" : "write"} ${retrofit ? "retrofit" : "attach"} report ${relative(reportPath)}`);
  if (dryRun) return;

  const content = [
    "# Harness Attach Report",
    "",
    `- Mode: ${retrofit ? "retrofit" : "attach"}${prune ? "" : " (no-prune)"}`,
    `- Harness: ${relative(harnessRoot)}`,
    "",
    "## Operations",
    "",
    ...operations.map((operation) => `- ${operation}`),
    "",
    "## Conflicts",
    "",
    ...(conflicts.length ? conflicts.map((conflict) => `- ${conflict}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, content, "utf8");
}

function printDiagnostics() {
  for (const conflict of conflicts) console.log(`- conflict: ${conflict}`);
  for (const warning of warnings) console.log(`- warning: ${warning}`);
}

function autoHarnessRoot(currentScriptPath) {
  return path.relative(projectRoot, path.resolve(path.dirname(currentScriptPath), "..", ".."));
}

function exists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function sameRealPath(left, right) {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
}

function toPortableRelative(from, to) {
  const relativePath = path.relative(from, to) || ".";
  return relativePath.startsWith(".") ? relativePath : `.${path.sep}${relativePath}`;
}

function relative(filePath) {
  return path.relative(projectRoot, filePath) || ".";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;

    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(`[attach-submodule] ${message}`);
  process.exit(1);
}
