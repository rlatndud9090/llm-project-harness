#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, fail, parseArgs, pathExists, readText, writeText } from "./lib.mjs";

// Installs a pre-commit hook into the CURRENT git repository so that commits are
// blocked when `npm run harness:check` fails. This is a harness-provided helper:
// the value lives in consuming projects (project-mode artifact checks). Nothing
// is installed automatically — a project runs `npm run harness:hooks` to opt in.

const MARKER = "llm-project-harness pre-commit";

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args["dry-run"]);
const force = Boolean(args.force);
const checkCommand = typeof args.command === "string" ? args.command : "npm run harness:check";

const hookBody = `#!/bin/sh
# >>> ${MARKER} >>>
# Installed by scripts/harness/install-hooks.mjs.
# Blocks commits whose harness artifacts fail validation.
# Remove this file (or run with a project-local hook) to opt out.
${checkCommand}
# <<< ${MARKER} <<<
`;

const hookPath = path.join(resolveHooksDir(), "pre-commit");
const relativeHook = path.relative(REPO_ROOT, hookPath) || hookPath;

if (!pathExists(hookPath)) {
  write(hookPath, hookBody, `install ${relativeHook}`);
} else if (readText(hookPath).includes(MARKER)) {
  write(hookPath, hookBody, `update ${relativeHook}`);
} else if (force) {
  const backupPath = `${hookPath}.local.bak`;
  if (!dryRun) fs.copyFileSync(hookPath, backupPath);
  write(hookPath, hookBody, `replace ${relativeHook} (backed up to ${path.basename(backupPath)})`);
} else {
  console.error(`[install-hooks] a non-harness pre-commit hook already exists: ${relativeHook}`);
  console.error(`[install-hooks] add \`${checkCommand}\` to it manually, or re-run with --force to replace it (a .local.bak backup is kept).`);
  process.exit(1);
}

console.log("[install-hooks] ok");
console.log(`- hook: ${relativeHook}`);
console.log(`- runs: ${checkCommand}`);

function resolveHooksDir() {
  let hooksDir;
  try {
    hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    fail("not a git repository; run this from a project that has been initialized with git");
  }

  const absolute = path.resolve(REPO_ROOT, hooksDir);
  if (!dryRun) fs.mkdirSync(absolute, { recursive: true });
  return absolute;
}

function write(filePath, content, label) {
  if (dryRun) {
    console.log(`[dry-run] ${label}`);
    return;
  }
  writeText(filePath, content);
  fs.chmodSync(filePath, 0o755);
}
