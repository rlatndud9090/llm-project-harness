#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, fail, findHarnessRoot, parseArgs, pathExists, readText, toPosix, writeText } from "./lib.mjs";

// Installs git hooks into the CURRENT git repository:
//   - pre-commit: blocks commits when `npm run harness:check` fails
//   - commit-msg: blocks commits whose message lacks the `관련 문서:` block
// This is a harness-provided helper; the value lives in consuming projects.
// Nothing is installed automatically — a project runs `npm run harness:hooks`
// to opt in. The harness provider repo skips the commit-msg check at runtime
// (verify-commit-msg.mjs returns early there), so installing here is harmless.

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args["dry-run"]);
const force = Boolean(args.force);
const checkCommand = typeof args.command === "string" ? args.command : "npm run harness:check";

const verifyScript = path.join(findHarnessRoot(), "scripts", "harness", "verify-commit-msg.mjs");
const verifyMsgCommand = `node "${toPosix(path.relative(REPO_ROOT, verifyScript)) || verifyScript}" "$1"`;

const hooksDir = resolveHooksDir();

installHook("pre-commit", checkCommand);
installHook("commit-msg", verifyMsgCommand);

console.log("[install-hooks] ok");

function markerFor(name) {
  return `llm-project-harness ${name}`;
}

function hookBody(name, command) {
  const marker = markerFor(name);
  return `#!/bin/sh
# >>> ${marker} >>>
# Installed by scripts/harness/install-hooks.mjs.
# Remove this file (or run with a project-local hook) to opt out.
${command}
# <<< ${marker} <<<
`;
}

function installHook(name, command) {
  const marker = markerFor(name);
  const hookPath = path.join(hooksDir, name);
  const relativeHook = path.relative(REPO_ROOT, hookPath) || hookPath;
  const body = hookBody(name, command);

  if (!pathExists(hookPath)) {
    write(hookPath, body, `install ${relativeHook}`);
  } else if (readText(hookPath).includes(marker)) {
    write(hookPath, body, `update ${relativeHook}`);
  } else if (force) {
    const backupPath = `${hookPath}.local.bak`;
    if (!dryRun) fs.copyFileSync(hookPath, backupPath);
    write(hookPath, body, `replace ${relativeHook} (backed up to ${path.basename(backupPath)})`);
  } else {
    console.error(`[install-hooks] a non-harness ${name} hook already exists: ${relativeHook}`);
    console.error(`[install-hooks] add the harness command to it manually, or re-run with --force to replace it (a .local.bak backup is kept).`);
    process.exit(1);
  }
  console.log(`- ${name}: ${command}`);
}

function resolveHooksDir() {
  let hooksPath;
  try {
    hooksPath = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    fail("not a git repository; run this from a project that has been initialized with git");
  }

  const absolute = path.resolve(REPO_ROOT, hooksPath);
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
