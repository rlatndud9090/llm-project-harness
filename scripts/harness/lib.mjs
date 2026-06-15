import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = process.cwd();
export const RAW_TYPES = new Set(["feature", "bugfix", "chore"]);
export const VAGUE_SLUGS = new Set(["misc", "update", "updates", "change", "changes", "fix", "work", "wip"]);

export function fail(message) {
  console.error(`[harness] ${message}`);
  process.exit(1);
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

export function pathExists(filePath) {
  return fs.existsSync(filePath);
}

export function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

export function findHarnessRoot() {
  const candidates = [
    repoPath(".harness"),
    REPO_ROOT,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  ];

  for (const candidate of candidates) {
    if (pathExists(path.join(candidate, "harness", "protocols"))) {
      return candidate;
    }
  }

  fail("could not locate harness root; run from a harness repo or a project with .harness");
}

export function harnessPath(...parts) {
  return path.join(findHarnessRoot(), ...parts);
}

export function isHarnessRepository() {
  return path.resolve(findHarnessRoot()) === path.resolve(REPO_ROOT);
}

export function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

export function getCurrentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    try {
      return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "HEAD";
    }
  }
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }

    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

export function parseWorkBranch(branch) {
  const match = /^(feature|bugfix|chore)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(branch);
  if (!match) return null;

  const [, type, slug] = match;
  if (VAGUE_SLUGS.has(slug)) {
    return { type, slug, invalid: `slug "${slug}" is too vague` };
  }

  return { type, slug };
}

export function validateTypeAndSlug(type, slug) {
  if (!RAW_TYPES.has(type)) {
    fail(`type must be one of: ${Array.from(RAW_TYPES).join(", ")}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(`slug must be kebab-case: ${slug}`);
  }
  if (VAGUE_SLUGS.has(slug)) {
    fail(`slug is too vague: ${slug}`);
  }
}

export function rawUnitPath(type, slug) {
  validateTypeAndSlug(type, slug);
  return repoPath("docs", "raw", type, slug);
}

export function inferRawUnitFromBranch() {
  const branch = getCurrentBranch();
  const parsed = parseWorkBranch(branch);
  if (!parsed) return { branch, parsed: null };
  if (parsed.invalid) fail(parsed.invalid);
  return { branch, parsed };
}

export function resolveTimezone() {
  const fromEnv = process.env.HARNESS_TZ?.trim();
  if (fromEnv) return fromEnv;
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (local) return local;
  } catch {
    // fall through to the default below
  }
  return "Asia/Seoul";
}

export function today(timeZone = resolveTimezone()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

// Backwards-compatible alias; prefer today(), which honors HARNESS_TZ and the
// host timezone before falling back to Asia/Seoul.
export function todaySeoul() {
  return today("Asia/Seoul");
}

export function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const body = content.slice(4, end).trim();
  const fields = {};
  for (const line of body.split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    fields[key] = rawValue.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  return fields;
}

export function extractH1(content) {
  const match = /^#\s+(.+)$/m.exec(content);
  return match?.[1]?.trim() ?? null;
}

export function stripKnownPrefix(title) {
  return title.replace(/^(PRD|ADR|Bugfix|Chore|Notes):\s*/i, "").trim();
}

export function relativeFromWiki(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : repoPath(filePath);
  return toPosix(path.relative(repoPath("docs", "wiki"), absolute));
}

export function listMarkdownFiles(directory) {
  if (!pathExists(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

// Reads a tracked file's content at a git ref. Returns null when git is
// unavailable, the path is untracked, or the ref does not exist (e.g. a brand
// new raw unit). Callers treat null as "no previous state to compare".
export function gitShow(relativePosixPath, ref = "HEAD") {
  try {
    return execFileSync("git", ["show", `${ref}:${relativePosixPath}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// Only the unambiguous backward moves are forbidden. Reopening a rejected PRD
// (rejected -> draft) or retiring an accepted ADR (accepted -> superseded) stay
// allowed on purpose. Each entry is [fromStatus, toStatus].
export const FORBIDDEN_STATUS_TRANSITIONS = {
  "prd.md": [
    ["approved", "draft"],
    ["approved", "review"],
  ],
  "adr.md": [
    ["accepted", "proposed"],
    ["deprecated", "proposed"],
    ["deprecated", "accepted"],
    ["superseded", "proposed"],
    ["superseded", "accepted"],
  ],
  "bugfix.md": [
    ["fixed", "draft"],
    ["fixed", "review"],
  ],
  "chore.md": [["done", "draft"]],
};

export function isForbiddenTransition(baseName, fromStatus, toStatus) {
  const transitions = FORBIDDEN_STATUS_TRANSITIONS[baseName];
  if (!transitions) return false;
  return transitions.some(([from, to]) => from === fromStatus && to === toStatus);
}
