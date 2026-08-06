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

// Git for Windows는 시스템 gitconfig에 `core.autocrlf=true`를 심어 배포되므로,
// Windows 소비 프로젝트의 워킹트리는 기본적으로 CRLF다. 하네스의 검사는 거의
// 전부 줄 단위 문자열 매칭(`---\n` 구분자, `^##\s+제목$` 같은 앵커, 라인 split)
// 이라, CR 한 글자가 붙는 것만으로 "frontmatter 없음", "필수 섹션 없음" 같은
// 대량 오탐이 난다. 리눅스 CI는 인덱스(LF)를 보므로 재현되지 않아 원인을 찾기도
// 어렵다. 그래서 하네스가 텍스트를 읽어 들이는 단일 지점에서 EOL을 정규화한다.
// BOM도 같은 실패 모드(첫 구분자 매칭 실패)를 만들므로 함께 벗긴다.
//
// 정규화는 "하네스가 보는 내용"만 바꾼다. 디스크의 파일을 건드리지 않으므로 이
// 함수만으로 워킹트리가 변환되지는 않는다(예방은 소비 프로젝트의 `.gitattributes`가
// 맡는다. attach가 심어 준다).
export function normalizeEol(content) {
  return content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

export function readText(filePath) {
  return normalizeEol(fs.readFileSync(filePath, "utf8"));
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

// The npm package name the harness ships under. A consuming project depends on it
// (devDependency, e.g. `github:<owner>/llm-project-harness#<tag>`); the installed
// package lives at `node_modules/llm-project-harness` and the `.harness` mount is a
// symlink into it (see ensureHarnessLink). No longer a git submodule.
export const HARNESS_PACKAGE_NAME = "llm-project-harness";

export function findHarnessRoot() {
  const candidates = [
    // The stable `.harness` mount (a symlink into the installed package). Kept first
    // so every `.harness/...` reference across adapters/protocols resolves fast.
    repoPath(".harness"),
    // Fall back to the installed package directly, so scripts still locate the
    // harness when the `.harness` symlink is missing (e.g. postinstall not yet run).
    repoPath("node_modules", HARNESS_PACKAGE_NAME),
    REPO_ROOT,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  ];

  for (const candidate of candidates) {
    if (pathExists(path.join(candidate, "harness", "protocols"))) {
      return candidate;
    }
  }

  fail("could not locate harness root; run from a harness repo or a project with the llm-project-harness devDependency");
}

// Creates/repairs the `.harness` mount as a symlink into the installed
// `node_modules/llm-project-harness` package. The harness is distributed as a
// devDependency, not a git submodule, so a consumer `postinstall` (link.mjs) runs
// this after every install to (re)create `.harness` — keeping every `.harness/...`
// reference (adapters, protocols, package scripts) resolvable without a submodule.
// Idempotent and best-effort; returns a status string the caller reports on:
//   - "package-absent": the devDependency is not installed (e.g. prod `--omit=dev`
//     or before the first install) → nothing to link, no-op.
//   - "ok": `.harness` is already the correct symlink → no-op.
//   - "occupied": `.harness` is a real directory/file (most likely a not-yet-removed
//     legacy git submodule) → never clobbered; the caller warns so migration removes
//     the submodule first.
//   - "created"/"would-create": the symlink was (or would be) made.
export function ensureHarnessLink(projectRoot = REPO_ROOT, { dryRun = false } = {}) {
  const target = path.join(projectRoot, "node_modules", HARNESS_PACKAGE_NAME);
  const link = path.join(projectRoot, ".harness");

  // Only link when the package is actually installed and looks like the harness.
  if (!pathExists(path.join(target, "harness", "protocols"))) {
    return { status: "package-absent", link, target };
  }

  let existing = null;
  try {
    existing = fs.lstatSync(link);
  } catch {
    // no `.harness` yet → create below
  }

  if (existing) {
    if (existing.isSymbolicLink()) {
      let current;
      try {
        current = fs.readlinkSync(link);
      } catch {
        current = null;
      }
      if (current && path.resolve(path.dirname(link), current) === path.resolve(target)) {
        return { status: "ok", link, target };
      }
      // A stale/wrong symlink (e.g. an older layout) → replace it.
      if (!dryRun) fs.rmSync(link, { force: true });
    } else {
      // A real directory/file — most likely a git submodule not yet removed. Never
      // clobber it; migration must `git submodule deinit`/`git rm` first.
      return { status: "occupied", link, target };
    }
  }

  if (dryRun) return { status: "would-create", link, target };

  // Windows: a junction links directories without Developer Mode or core.symlinks,
  // and needs an ABSOLUTE target. POSIX uses a portable relative dir symlink.
  const type = process.platform === "win32" ? "junction" : "dir";
  const linkTarget = type === "junction" ? target : toPosix(path.relative(path.dirname(link), target));
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(linkTarget, link, type);
  return { status: "created", link, target };
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

// Base branches kickoff may auto-branch off of. A checkout that moves global git
// state is only safe from one of these (a fresh feature branch off a clean base);
// on any other branch kickoff defers the choice (worktree vs in-place) to the caller.
export const BASE_BRANCHES = new Set(["main", "master"]);

// True when REPO_ROOT is inside a git work tree. kickoff runs in non-git contexts
// (tests, freshly scaffolded consumers) too, so every branch operation guards on
// this first and treats a non-repo as "do nothing".
export function isGitRepo() {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    );
  } catch {
    return false;
  }
}

// True when the work tree has no staged/unstaged/untracked changes (porcelain
// output is empty). Auto-branching only happens on a clean tree so a checkout can
// never carry or strand a work-in-progress. Errors read as "not clean" (fail safe).
export function isWorkingTreeClean() {
  const changed = workingTreeChangedPaths();
  return Array.isArray(changed) && changed.length === 0;
}

// Returns the working-tree paths git reports as changed (staged, unstaged, or
// untracked), each repo-root-relative and POSIX. `-uall` expands untracked
// directories to individual files so a caller can reason about exact paths — git
// otherwise collapses a wholly-untracked dir to an ancestor entry (e.g. the whole
// `docs/raw/`), which would defeat a per-subtree ignore. Returns null on error so
// callers can fail safe (treat "unknown" as not clean). Lets a caller decide a
// tree is "clean enough" by disregarding paths it owns.
export function workingTreeChangedPaths() {
  let out;
  try {
    // `-c core.quotepath=false` stops git from octal-escaping non-ASCII paths, so
    // callers get the real UTF-8 path instead of a config-dependent quoted form.
    // (Space-containing names are still double-quoted, but the harness's own paths
    // are all ASCII/space-free, and any unmatched path safely reads as "changed".)
    out = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "-uall"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  const trimmed = out.replace(/\n+$/, "");
  if (trimmed === "") return [];
  return trimmed
    .split("\n")
    .map((line) => {
      // Porcelain v1: two status columns + a space, then the path. Renames/copies
      // render as "old -> new"; take the destination. Paths with special or
      // non-ASCII characters are git-quoted and left verbatim here — they will not
      // match an ASCII ignore set, so they correctly read as real changes.
      const body = line.slice(3);
      const arrow = body.indexOf(" -> ");
      return arrow >= 0 ? body.slice(arrow + 4) : body;
    })
    .filter((entry) => entry.length > 0);
}

// True when a local branch of this name already exists. Used so kickoff never runs
// `checkout -b` on an existing branch (which would fail); it hints instead.
export function localBranchExists(branch) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

// Creates and switches to a new branch. Throws on failure (e.g. dirty tree,
// invalid name); callers decide whether to warn or abort.
export function createAndCheckoutBranch(branch) {
  execFileSync("git", ["checkout", "-b", branch], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
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

// ─── GitHub issue reference (kickoff --issue provenance) ─────────────────────
// Normalizes the reference passed to `kickoff --issue`, the durable link from a
// work unit back to the GitHub issue that motivated it. Accepts a bare number
// ("123"), a hash form ("#123"), or a full issue URL in the canonical
// `<scheme>://<host>/<owner>/<repo>/issues/<n>` shape (host-agnostic so GitHub
// Enterprise / self-hosted remotes work, but the `owner/repo/issues/<n>` tail is
// required — a bare `/issues/<n>`, a `/blob/.../issues/<n>` path, or a `/pull/<n>`
// URL do NOT match). Returns { number, ref } where `ref` is the canonical string
// to record as provenance: the base issue URL when a URL was given (clickable,
// with any trailing `/`, `?query`, or `#fragment` stripped), otherwise "#<n>" with
// leading zeros dropped. Returns null for anything unrecognizable — or a
// non-positive issue number — so the caller (kickoff) fails loudly instead of
// recording garbage provenance. This same recognizer flags a bare issue-number
// positional the skill forgot to resolve.
export function normalizeIssueRef(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const urlMatch = /^(https?:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/issues\/(\d+))(?:[/?#]|$)/.exec(trimmed);
  if (urlMatch) {
    const number = Number(urlMatch[2]);
    return number >= 1 ? { number, ref: urlMatch[1] } : null;
  }
  const numMatch = /^#?(\d+)$/.exec(trimmed);
  if (numMatch) {
    const number = Number(numMatch[1]);
    return number >= 1 ? { number, ref: `#${number}` } : null;
  }
  return null;
}

// frontmatter 블록의 경계를 CRLF·BOM에 관계없이 찾는다. readText가 이미 EOL을
// 정규화하지만, 이 함수들은 파일을 거치지 않은 문자열도 받는다(예:
// claude-approval-guard가 직접 읽은 state.md, git show 출력, 테스트 입력). 구분자
// 판정을 여기서도 CRLF에 열어 둬야 "frontmatter가 있는데 없다고 판정"하는 경로가
// 남지 않는다 — 그 오판은 읽기 경로에서는 오탐이지만 쓰기 경로(setFrontmatterField)
// 에서는 기존 블록 위에 새 블록을 얹는 실제 파일 손상이 된다.
//
// 반환하는 인덱스는 원본 문자열 기준이다.
//   start        : 여는 `---` 줄 다음(= 첫 필드 줄의 시작)
//   end          : 닫는 구분자를 시작하는 개행의 위치
//   closeLength  : 그 개행 + `---`의 길이("\n---" = 4, "\r\n---" = 5)
function frontmatterBounds(content) {
  const open = /^\uFEFF?---\r?\n/.exec(content);
  if (!open) return null;

  const start = open[0].length;
  const close = /\r?\n---/.exec(content.slice(start));
  if (!close) return null;

  return { start, end: start + close.index, closeLength: close[0].length };
}

export function parseFrontmatter(content) {
  const bounds = frontmatterBounds(content);
  if (!bounds) return null;

  const body = content.slice(bounds.start, bounds.end).trim();
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    fields[key] = rawValue.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  return fields;
}

// Returns the markdown body after the frontmatter block (or the whole content
// when there is no frontmatter). Content/placeholder checks use this so they
// never match frontmatter keys.
export function bodyAfterFrontmatter(content) {
  const bounds = frontmatterBounds(content);
  if (!bounds) return content;
  return content.slice(bounds.end + bounds.closeLength);
}

// The first body H1. Skips the leading frontmatter block first so a `# ...`
// comment line inside frontmatter (e.g. the `# section(섹션, 선택): …` hints the
// kickoff templates carry) is never mistaken for the title. bodyAfterFrontmatter
// returns the whole content unchanged when there is no frontmatter, so this stays
// correct for frontmatter-less artifacts (notes.md) too.
export function extractH1(content) {
  const match = /^#\s+(.+)$/m.exec(bodyAfterFrontmatter(content));
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
    // git show는 인덱스에 저장된 그대로(대개 LF)를 준다. 이 출력은 워킹트리를
    // readText로 읽은 내용과 곧장 비교되므로(ADR 본문 불변, status 전이), 같은
    // 정규화를 거치게 해서 "EOL만 다른데 본문이 바뀌었다"는 오판을 막는다.
    return normalizeEol(
      execFileSync("git", ["show", `${ref}:${relativePosixPath}`], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return null;
  }
}

// Only the unambiguous backward moves are forbidden. Reopening a rejected PRD
// (rejected -> draft) or retiring an accepted ADR (accepted -> superseded) stay
// allowed on purpose. Each entry is [fromStatus, toStatus].
//
// Approval runs in two tiers: review -> pre-approved (build-entry gate) -> approved
// (final, recorded at $make-pr); proposed -> pre-accepted -> accepted for the ADR.
// A recorded (pre-)approval must never silently rewind: dropping out of pre-approved
// back to review/draft, or demoting a final approval back to a pre-approval, are all
// forbidden. Both flips are only ever produced by harness:approve (writing via fs, so
// the runtime guard never sees them); these rules are the git-time backstop.
export const FORBIDDEN_STATUS_TRANSITIONS = {
  "prd.md": [
    ["approved", "draft"],
    ["approved", "review"],
    ["approved", "pre-approved"],
    ["pre-approved", "draft"],
    ["pre-approved", "review"],
  ],
  "adr.md": [
    ["accepted", "proposed"],
    ["accepted", "pre-accepted"],
    ["pre-accepted", "proposed"],
    ["deprecated", "proposed"],
    ["deprecated", "pre-accepted"],
    ["deprecated", "accepted"],
    ["superseded", "proposed"],
    ["superseded", "pre-accepted"],
    ["superseded", "accepted"],
  ],
  "bugfix.md": [
    ["fixed", "draft"],
    ["fixed", "review"],
  ],
  // chore units are notes-only (no status lifecycle); their file is notes.md,
  // which carries no machine-checked status, so there is no chore transition rule.
};

export function isForbiddenTransition(baseName, fromStatus, toStatus) {
  const transitions = FORBIDDEN_STATUS_TRANSITIONS[baseName];
  if (!transitions) return false;
  return transitions.some(([from, to]) => from === fromStatus && to === toStatus);
}

// The per-unit state ledger (state.md) is the workflow checkpoint AND the
// machine-checkable approval evidence. A resuming session reads it first to
// learn exactly which stage the unit is in, and artifact-check cross-checks it
// against the PRD/ADR statuses so a fabricated or skipped approval cannot pass.
export const STAGE_VALUES = new Set([
  "kickoff",
  "prd-draft",
  "prd-review",
  "adr-draft",
  "adr-review",
  "awaiting-approval",
  "pre-approved",
  "approved",
  "implementing",
  "integrated",
]);

// The build tier: stages a unit only reaches once the user's PRE-approval (the
// build-entry gate) is recorded. `pre-approved` enters the build, `implementing`
// is the work, `approved` is the FINAL approval stamped at $make-pr, `integrated`
// is post-merge. Moving out of the build tier back into a pre-build stage is an
// "un-approval" and is forbidden — a new session must never silently rewind past a
// recorded pre-approval.
export const BUILD_STAGES = new Set(["pre-approved", "approved", "implementing", "integrated"]);
// Stages that require a FINAL (approved) PRD, not just a pre-approval. Reached only
// after $make-pr flips the artifacts to approved/accepted.
export const FINAL_STAGES = new Set(["approved", "integrated"]);
export const PRE_BUILD_STAGES = new Set([
  "kickoff",
  "prd-draft",
  "prd-review",
  "adr-draft",
  "adr-review",
  "awaiting-approval",
]);

// Stages that ARE the ADR authoring phase. Re-entering these from a build-tier
// stage is legitimate when the PRD was (pre-)approved first and the ADR is still
// being written (the PRD stays (pre-)approved on its own axis, not an un-approval).
const ADR_PHASE_STAGES = new Set(["adr-draft", "adr-review"]);

export function isForbiddenStageTransition(fromStage, toStage) {
  // Allow resuming ADR authoring after a PRD-first (pre-)approval. The PRD state is
  // still protected on the prd_status axis (approval events + status transitions),
  // so moving a build-tier stage -> `adr-draft`/`adr-review` does not rewind it.
  if (BUILD_STAGES.has(fromStage) && ADR_PHASE_STAGES.has(toStage)) return false;
  return BUILD_STAGES.has(fromStage) && PRE_BUILD_STAGES.has(toStage);
}

// Step separation between $prd-helper and $adr-helper is machine-enforced on the
// `stage` axis: the ADR may only be authored once the unit has explicitly entered
// the ADR phase (stage adr-draft) or later. Before that, adr.md stays the kickoff
// skeleton and the ADR-need decision lives in prd.md "## ADR 필요 여부". This stops
// a PRD session from drifting into ADR authoring.
export const ADR_AUTHORING_STAGES = new Set(["adr-draft", "adr-review", "pre-approved", "approved", "implementing", "integrated"]);

// True only for a recognized stage that precedes the ADR phase. An unknown or
// missing stage returns false so callers fail open (they never gate on an
// unparseable ledger; artifact-check flags an invalid stage separately).
export function isPreAdrStage(stage) {
  return STAGE_VALUES.has(stage) && !ADR_AUTHORING_STAGES.has(stage);
}

// "Authored" is decided by comparing adr.md against the pristine kickoff skeleton:
// at a pre-ADR stage the ADR body must still BE that skeleton. We compare the body
// (title-independent — the H1 "# ADR: <title>" line is dropped and whitespace is
// normalized) against the canonical template body. ANY substantive deviation reads
// as authored: a filled decision, a stub, a legacy "불필요" one-liner, or partial
// authoring that leaves a template token behind. This is deliberately stricter than
// a token check — a single leftover `{…}` placeholder (e.g. an un-renamed 선택지
// header) would defeat a token heuristic while the decision sections are fully
// written, which is exactly the drift this gate must catch.
function normalizeAdrBody(body) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmedEnd = line.replace(/\s+$/, "");
      // Canonicalize the H1 "# ADR: <title>" line to a title-free form. Canonicalizing
      // (rather than dropping) keeps the check title-independent while still detecting a
      // removed/altered H1 — dropping the line would let "skeleton minus its H1" pass.
      return /^#\s/.test(trimmedEnd.trim()) ? "# ADR:" : trimmedEnd;
    })
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// The canonical ADR skeleton body, read from the same harness template kickoff
// materializes from. Resolving it here (not hard-coding markers) keeps the gate
// correct even if the template's sections change.
export function skeletonAdrBody() {
  return bodyAfterFrontmatter(readText(harnessPath("harness", "templates", "raw", "feature-adr.md")));
}

export function adrBodyLooksAuthored(adrContent, skeletonBody = skeletonAdrBody()) {
  return normalizeAdrBody(bodyAfterFrontmatter(adrContent)) !== normalizeAdrBody(skeletonBody);
}

// Replaces (or inserts) a single `key: value` line inside the frontmatter block
// while leaving the body and other keys untouched. Used by kickoff/approve so
// status flips are surgical edits, never a full-file rewrite.
export function setFrontmatterField(content, key, value) {
  const line = `${key}: ${value}`;
  const bounds = frontmatterBounds(content);

  // "frontmatter 없음" 분기는 블록을 통째로 앞에 붙인다. 구분자를 CRLF까지
  // 인식하지 못하면 CRLF 파일이 전부 이 분기를 타고, 멀쩡한 frontmatter 위에
  // 두 번째 블록이 얹힌다(원본 블록은 본문으로 밀려나고 status는 그대로 남는다).
  // approve는 한 번에 이 함수를 최대 7번 부르므로 실행 한 번에 state.md에 블록이
  // 3개, prd.md에 2개 쌓였다. 승인을 기록하는 명령이 승인 아티팩트를 깨뜨리는 셈이라,
  // 경계 판정은 반드시 frontmatterBounds 한 곳을 거친다.
  if (!bounds) {
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    return `---${eol}${line}${eol}---${eol}${eol}${content}`;
  }

  const frontmatter = content.slice(bounds.start, bounds.end);
  const head = content.slice(0, bounds.start); // BOM + 여는 `---` 줄, 원본 그대로
  const rest = content.slice(bounds.end); // 닫는 구분자부터 끝까지, 원본 그대로
  // 편집한 줄의 EOL은 그 파일이 이미 쓰던 것을 따른다. 여기서 LF로 통일해 버리면
  // CRLF 워킹트리에서 파일 전체가 바뀐 것처럼 보여, 필드 하나를 뒤집는 수술적
  // 편집이라는 이 함수의 계약이 깨진다.
  const eol = frontmatter.includes("\r\n") || rest.startsWith("\r\n") ? "\r\n" : "\n";
  const keyPattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`);
  let replaced = false;
  const lines = frontmatter.split(/\r?\n/).map((existing) => {
    if (!replaced && keyPattern.test(existing)) {
      replaced = true;
      return line;
    }
    return existing;
  });
  if (!replaced) lines.push(line);
  return `${head}${lines.join(eol)}${rest}`;
}

// state.md records each approval as one strict, regex-parseable line so the CLI
// (writer) and artifact-check (reader) share an unambiguous format. The verbatim
// user quote is everything after `::` on the line. The kind separates the two tiers:
// PREAPPROVAL is the build-entry gate (review -> pre-approved), APPROVAL is the final
// stamp at $make-pr (pre-approved -> approved).
//   - PREAPPROVAL prd 2026-07-29 harness:approve :: 이대로 구현 들어가자
//   - APPROVAL    prd 2026-07-30 harness:approve :: 좋아, 이대로 PR 올려
export const APPROVAL_EVENT_RE = /^- (PREAPPROVAL|APPROVAL) (prd|adr) (\d{4}-\d{2}-\d{2}) (\S+) :: (.+)$/;

export function formatApprovalEvent({ kind = "APPROVAL", target, date, transport, quote }) {
  const oneLine = quote.replace(/\s+/g, " ").trim();
  return `- ${kind} ${target} ${date} ${transport} :: ${oneLine}`;
}

export function parseApprovalEvents(content) {
  const events = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const match = APPROVAL_EVENT_RE.exec(rawLine.trim());
    if (match) {
      events.push({ kind: match[1], target: match[2], date: match[3], transport: match[4], quote: match[5].trim() });
    }
  }
  return events;
}

// ─── Harness CHANGELOG + consumer sync ──────────────────────────────────────
// Each harness commit appends a `## <id>` entry (newest-first) to CHANGELOG.md
// describing the change and the consumer action needed to reconcile. A consuming
// project records the entry id it last reconciled in a `.harness-sync` file;
// artifact-check fails until that id matches the harness CHANGELOG head, forcing
// the reconciliation step (e.g. rewriting docs/wiki to a new format) on update.

// The id of the newest CHANGELOG entry (the text after the first `## `).
export function changelogHeadId(content) {
  const match = /^##\s+(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

// The CHANGELOG text of every entry newer than `ackedId` (from the top down to,
// but excluding, the acked entry). When `ackedId` is not found, returns all
// entries. Used by harness:sync to show a consumer exactly what to reconcile.
export function changelogEntriesAfter(content, ackedId) {
  const out = [];
  let capturing = false;
  for (const line of content.split(/\r?\n/)) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      if (ackedId && match[1].trim() === ackedId) break;
      capturing = true;
    }
    if (capturing) out.push(line);
  }
  return out.join("\n").trim();
}

// ─── Wiki area taxonomy (shared by wiki-ingest.mjs and artifact-check.mjs) ───
// An "area" is a narrow functional/structural unit of the product (a screen, a
// flow, an engine). It replaces the old ephemeral `--category` CLI argument with
// a durable axis declared in a unit's primary-artifact frontmatter, so the wiki
// can group each area's work units into a dated evolution timeline with a current
// decision pointer. These constants live here (promoted from the two scripts) so
// the writer (ingest) and the reader (check) share one source of truth.

// Reserved operations buckets: flat, not a product lineage. Excluded from the
// timeline/current-pointer gates so bumps and chores never need an area.
export const OPERATIONS_CATEGORIES = ["프로젝트 운영", "Project Operations"];

// Names too broad to be a real area; a feature must pick a narrower one.
export const BROAD_FEATURE_CATEGORIES = new Set([
  "Product & Architecture",
  "Architecture",
  "Product",
  "Products",
  "Feature",
  "Features",
  "General",
  "Misc",
  "Miscellaneous",
  "Other",
  "기능",
  "전체 기능",
  "아키텍처",
  "공통",
  "기타",
]);

// The wiki navigation label marking a section's current (latest) decision. Only
// its count/placement is machine-checked; which line earns it stays model-judged.
export const CURRENT_MARKER = "_(현재)_";

// ─── Wiki authoring-guidance leak detection ─────────────────────────────────
// A consuming project's docs/wiki carries ONLY project content: direction and the
// dated area/section lineage links. The "how to write the wiki" guidance (what an
// area is, how to read the timeline, how to run ingest, the Maintenance rules)
// belongs in harness/protocols/wiki-ingest.md, NOT baked into each project's wiki.
// Older attach/kickoff seeds copied the whole template — rules and all — into the
// wiki, freezing the guidance there. These sentinels are high-precision phrases
// that appear ONLY in that leaked boilerplate (never in real project content or the
// current thin template), so artifact-check can flag a wiki that still carries it.
export const WIKI_AUTHORING_SENTINELS = [
  "이 한 장은 에이전트가", // 상단 안내 blockquote (신형)
  "이 문서는 항상 로딩되는", // 상단 안내 blockquote (구형)
  "상세 종합본은 두지 않으며", // "합성 문서로 키우지 않는다" 안내
  "종합 요약 문서로 키우지 않는다", // 구형 안내 변형
  "각 `### <영역>`은 앱의", // "Raw Units" 설명 문단 도입부
  "영역 설계 원칙", // "Raw Units" 설명 문단의 규칙 목록
  "읽는 법 —", // "읽는 법 — 한 영역 아래 줄들은…" 타임라인 읽기 안내
  "새 raw work unit은", // 하단 "Maintenance" 규칙 블록
];

// The first authoring-guidance sentinel present in wiki text, or null when the wiki
// is clean. Pure/testable; the checker turns a hit into a hard error that points to
// wiki-ingest.md as the guidance's new home.
export function findWikiAuthoringSentinel(text) {
  return WIKI_AUTHORING_SENTINELS.find((sentinel) => text.includes(sentinel)) ?? null;
}

// ─── Harness freshness probe throttle ───────────────────────────────────────
// The freshness nudge does a live `git ls-remote` (network). Running it on every
// harness:check would add latency to every commit (pre-commit runs the check). The
// user asked for an occasional ("한번씩") nudge, so we throttle the network probe to
// at most once per window per repo, tracked by an OS-temp marker's mtime (kept out
// of the repo so it never shows in git status). Skipping the probe is not a skip of
// the check — only the network freshness lookup is rate-limited.
export const FRESHNESS_THROTTLE_MS = 4 * 60 * 60 * 1000; // 4 hours

// True when enough time has passed since the last freshness probe (or there was
// none). Pure/testable; `lastProbeMs = 0` (no marker) always probes.
export function shouldProbeFreshness(lastProbeMs, nowMs, throttleMs = FRESHNESS_THROTTLE_MS) {
  return nowMs - lastProbeMs >= throttleMs;
}

// The harness is a devDependency pinned by tag (`#v1.2.3`). The freshness nudge
// compares the pinned tag against the newest tag upstream, so these parse and order
// semver-ish tags. A leading `v` is optional; anything not `MAJOR.MINOR.PATCH`
// (pre-release, non-numeric) is treated as "not comparable" so the nudge stays quiet
// rather than guessing.
export function parseSemverTag(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag ?? "").trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

// True only when `a` is a strictly newer semver tag than `b`. Either side being
// non-semver returns false (no nudge).
export function isNewerSemverTag(a, b) {
  const left = parseSemverTag(a);
  const right = parseSemverTag(b);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

// The newest semver tag in `git ls-remote --tags` output. Each line is
// "<sha>\trefs/tags/<tag>"; dereferenced tag lines end in "^{}" and are ignored
// (the annotated tag object and its target share the same tag name). Returns null
// when no semver-ish tag is present.
export function latestSemverTagFromLsRemote(output) {
  let best = null;
  for (const line of String(output ?? "").split(/\r?\n/)) {
    const match = /\trefs\/tags\/(.+?)(\^\{\})?$/.exec(line);
    if (!match || match[2]) continue;
    const tag = match[1];
    if (!parseSemverTag(tag)) continue;
    if (!best || isNewerSemverTag(tag, best)) best = tag;
  }
  return best;
}

// Parses a consuming project's harness devDependency spec into { owner, repo, tag }.
// Accepts the common npm git-dependency forms that pin a tag:
//   github:<owner>/<repo>#<tag>
//   <owner>/<repo>#<tag>
//   git+https://github.com/<owner>/<repo>.git#<tag>
//   https://github.com/<owner>/<repo>#<tag>
// Returns null when the harness is absent, unpinned (no `#<tag>`), or not a
// recognized GitHub spec — the freshness nudge simply stays quiet in those cases.
export function parseHarnessDependencySpec(packageJson, packageName = HARNESS_PACKAGE_NAME) {
  const deps = {
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.dependencies ?? {}),
  };
  const spec = deps[packageName];
  if (typeof spec !== "string") return null;

  const hash = spec.lastIndexOf("#");
  if (hash === -1) return null;
  const tag = spec.slice(hash + 1).trim();
  if (!tag) return null;

  const head = spec.slice(0, hash);
  const match =
    /^github:([^/]+)\/(.+)$/.exec(head) ||
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(head) ||
    /^([^/:@]+)\/([^/]+?)(?:\.git)?$/.exec(head);
  if (!match) return null;
  return { owner: match[1], repo: match[2], tag };
}

// A unit's `area` frontmatter is a comma-separated list (one work unit may evolve
// more than one area). Split, trim, and drop entries that are not real
// declarations: an empty value, a leftover `#` hint value, or an unsubstituted
// `{area}` kickoff token all read as "no area declared".
export function parseAreaList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith("#") && !entry.includes("{"));
}

// The artifact that carries a unit's area declaration: prd.md for a feature,
// bugfix.md for a bugfix. chore units have no product area (operations bucket).
export function primaryArtifactName(type) {
  if (type === "feature") return "prd.md";
  if (type === "bugfix") return "bugfix.md";
  return null;
}

export function readUnitAreas(unitDir, type) {
  const artifact = primaryArtifactName(type);
  if (!artifact) return [];
  const filePath = path.join(unitDir, artifact);
  if (!pathExists(filePath)) return [];
  return parseAreaList(parseFrontmatter(readText(filePath))?.area);
}

// ─── section 축 (area 상위 그룹) ─────────────────────────────────────────────
// section은 area보다 큰 단위(웹앱의 최상위 라우팅/제품 영역 단위)다. area가
// `### 헤딩`이라면 section은 그 상위 그룹으로, 프로젝트에 section이 2개 이상
// 선언되면 wiki가 index.md 한 장에서 section별 파일로 분리된다. area와 달리
// section은 단일 값이다(한 unit은 하나의 section에 속한다).

// The raw unit directories of a given type under docs/raw. Shared by ingest (to
// count distinct sections) and the checker (to iterate units).
export function unitDirs(type) {
  const base = repoPath("docs", "raw", type);
  if (!pathExists(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name));
}

// A unit's declared section: the single `section:` frontmatter value on its
// primary artifact (prd.md/bugfix.md). Returns null for chore units, an
// undeclared/blank value, a leftover `#` hint, or an unsubstituted `{...}` token.
export function readUnitSection(unitDir, type) {
  const artifact = primaryArtifactName(type);
  if (!artifact) return null;
  const filePath = path.join(unitDir, artifact);
  if (!pathExists(filePath)) return null;
  const raw = parseFrontmatter(readText(filePath))?.section;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.startsWith("#") || value.includes("{")) return null;
  return value;
}

// True once a unit has settled enough to be required in the wiki (its first
// ingest is due). This is the same "content settled" line the placeholder /
// required-section / area gates use: feature at prd.md review|pre-approved|approved,
// bugfix at bugfix.md review|fixed. A chore is notes-only with no review status, so
// kickoff links it immediately — it is always considered settled. A pre-review
// skeleton (kickoff / prd-draft) is NOT settled, so the wiki-link gates skip it
// (honoring the documented "harness:check is green right after kickoff" contract).
export function unitIsSettled(unitDir, type) {
  if (type === "feature") {
    const status = readArtifactStatus(unitDir, "prd.md");
    return status === "review" || status === "pre-approved" || status === "approved";
  }
  if (type === "bugfix") {
    const status = readArtifactStatus(unitDir, "bugfix.md");
    return status === "review" || status === "fixed";
  }
  return true; // chore: linked at kickoff, always required thereafter
}

function readArtifactStatus(unitDir, fileName) {
  const filePath = path.join(unitDir, fileName);
  if (!pathExists(filePath)) return null;
  return parseFrontmatter(readText(filePath))?.status ?? null;
}

// Every distinct section declared across the project's SETTLED feature/bugfix
// units. Its size decides the wiki layout: <=1 keeps everything in index.md, >=2
// means the wiki is split into per-section files. Counting only settled units
// keeps a not-yet-reviewed draft's seeded section from forcing a phantom split
// while it is still a kickoff skeleton (the wiki has nothing linked for it yet).
export function collectDeclaredSections() {
  const sections = new Set();
  for (const type of ["feature", "bugfix"]) {
    for (const dir of unitDirs(type)) {
      if (!unitIsSettled(dir, type)) continue;
      const section = readUnitSection(dir, type);
      if (section) sections.add(section);
    }
  }
  return sections;
}

// Wiki basenames the harness owns and a section must never collide with.
export const RESERVED_WIKI_BASENAMES = new Set(["index"]);

// Maps a section name to its wiki filename. Strips path-unsafe/separator
// characters, turns spaces into `-`, and keeps existing hyphens and non-ASCII
// (Korean) intact (e.g. "메인 레이아웃" -> "메인-레이아웃.md"). Returns null for an
// empty result or a reserved basename so the caller can fail loudly. Two
// different section names that sanitize to the same file are the caller's
// (checker's) collision to catch.
export function sectionFileName(section) {
  if (typeof section !== "string") return null;
  const base = section
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!base) return null;
  if (RESERVED_WIKI_BASENAMES.has(base.toLowerCase())) return null;
  return `${base}.md`;
}

// All markdown files directly under docs/wiki (index.md plus any per-section
// files). Section files live flat beside index.md so their `../raw/...` links
// resolve identically to the index's.
export function listWikiFiles() {
  const dir = repoPath("docs", "wiki");
  if (!pathExists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dir, entry.name));
}

// A dated wiki bullet begins with a backtick-wrapped ISO date, e.g.
//   - `2026-01-01` **Title** — [PRD](../raw/feature/x/prd.md)
export const DATED_BULLET_RE = /^-\s+`(\d{4}-\d{2}-\d{2})`/;

export function datedBulletDate(line) {
  return DATED_BULLET_RE.exec(line)?.[1] ?? null;
}

// Raw-unit links on a wiki line (only the ../raw/... targets the checker keys on).
export function rawLinksInLine(line) {
  return [...line.matchAll(/\]\((\.\.\/raw\/[^)]+)\)/g)].map((match) => match[1]);
}

// Parses the wiki index into its `### ` area sections with their bullet lines,
// stopping each section at the next `##`/`###` heading. Shared by the ingest
// (chronological insert) and the check (timeline/currency/grouping gates).
export function parseAreaSections(wiki) {
  const sections = [];
  let current = null;
  for (const line of wiki.split(/\r?\n/)) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const name = heading[1].trim();
      current = { name, isOperations: OPERATIONS_CATEGORIES.includes(name), lines: [] };
      sections.push(current);
      continue;
    }
    if (/^##\s+/.test(line)) {
      current = null;
      continue;
    }
    if (current && /^-\s/.test(line)) {
      const links = rawLinksInLine(line);
      current.lines.push({
        raw: line,
        date: datedBulletDate(line),
        links,
        primaryLink: links[0] ?? null,
        adrLink: links.find((link) => link.endsWith("/adr.md")) ?? null,
        hasCurrent: line.includes(CURRENT_MARKER),
        // Match only inside the reserved `_(superseded by …)_` navigation marker,
        // not a free-text title that happens to contain the words.
        hasSuperseded: /_\(superseded by/i.test(line),
      });
    }
  }
  return sections;
}
