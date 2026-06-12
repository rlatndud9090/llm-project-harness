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
const updatePackageScripts = !args["no-package-scripts"];

if (sameRealPath(projectRoot, harnessRoot)) {
  fail("run this from a consuming project root, not from the harness repository root");
}

if (!exists(path.join(harnessRoot, "harness", "protocols"))) {
  fail(`harness root does not look valid: ${harnessRoot}`);
}

const operations = [];

linkChildren(".codex", "agents");
linkChildren(".codex", "skills");
linkChildren(".claude", "agents");
linkChildren(".claude", "commands");
linkChildren(".claude", "skills");
linkChildren(".agents", "skills");

ensureProjectDocs();
if (updatePackageScripts) ensurePackageScripts();

if (dryRun) {
  for (const operation of operations) console.log(`[dry-run] ${operation}`);
  console.log("[attach-submodule] dry run complete");
} else {
  console.log("[attach-submodule] ok");
  for (const operation of operations) console.log(`- ${operation}`);
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

function linkAdapterPath(target, link, type) {
  if (exists(link) && !isExpectedSymlink(link, target) && !force) {
    operations.push(`kept local override ${relative(link)}`);
    return;
  }

  linkPath(target, link, type);
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

  ensureFile(
    path.join(projectRoot, "docs", "wiki", "index.md"),
    `# Project Wiki Index

> 이 문서는 항상 로딩되는 유일한 LLM Wiki 페이지다. 프로젝트 방향과 raw work
> unit 링크만 제공한다. 종합 요약 문서로 키우지 않는다.

Last updated: TODO Asia/Seoul

## Direction

- **무엇:** TODO
- **대상:** TODO
- **Knowledge boundary:** raw PRD/ADR/notes가 진실 원천이고, 이 index는 navigation만 맡는다.

## Raw Units

### Product & Architecture

### Project Operations

## Maintenance

- 새 raw work unit은 \`docs/raw/{feature,bugfix,chore}/branch-slug/\` 아래에 둔다.
- raw unit을 추가하면 \`npm run harness:ingest -- docs/raw/<type>/<slug>\`를 실행한다.
`,
  );

  ensureFile(
    path.join(projectRoot, "docs", "raw", "README.md"),
    `# Raw Sources

이 디렉터리는 이 프로젝트의 raw PRD/ADR/notes를 저장한다.
공용 템플릿은 \`.harness/harness/templates/raw\`에서 제공된다.
`,
  );

  ensureFile(
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
4. Use \`$do-next\` for open-ended product work.
5. Keep product-specific decisions in this project's \`docs/raw/\` and \`docs/wiki/\`.

Shared harness rules live in \`.harness/harness/\`. Root-level \`.codex/\`,
\`.claude/\`, and \`.agents/\` may contain symlinks to shared harness adapters
plus project-local skills or agents. Local project definitions are allowed and
take precedence when they occupy the same path.
`,
  );
}

function ensurePackageScripts() {
  const packagePath = path.join(projectRoot, "package.json");
  const desiredScripts = {
    "harness:start": "node .harness/scripts/harness/raw-start.mjs",
    "harness:ingest": "node .harness/scripts/harness/wiki-ingest.mjs",
    "harness:check": "node .harness/scripts/harness/artifact-check.mjs",
    "harness:gate": "node .harness/scripts/harness/gate.mjs",
  };
  const legacyScripts = {
    "harness:start": "node scripts/harness/raw-start.mjs",
    "harness:ingest": "node scripts/harness/wiki-ingest.mjs",
    "harness:check": "node scripts/harness/artifact-check.mjs",
    "harness:gate": "node scripts/harness/gate.mjs",
  };

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

function fail(message) {
  console.error(`[attach-submodule] ${message}`);
  process.exit(1);
}
