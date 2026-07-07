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

// Returns the markdown body after the frontmatter block (or the whole content
// when there is no frontmatter). Content/placeholder checks use this so they
// never match frontmatter keys.
export function bodyAfterFrontmatter(content) {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return content;
  return content.slice(end + 4);
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
  "approved",
  "implementing",
  "integrated",
]);

// Stages that only exist once the user has approved. Moving out of one of these
// back into a pre-approval stage is an "un-approval" and is forbidden (a new
// session must never silently rewind past a recorded approval). Forward moves,
// and rework that stays at/after `approved`, are allowed.
export const POST_APPROVAL_STAGES = new Set(["approved", "implementing", "integrated"]);
export const PRE_APPROVAL_STAGES = new Set([
  "kickoff",
  "prd-draft",
  "prd-review",
  "adr-draft",
  "adr-review",
  "awaiting-approval",
]);

// Stages that ARE the ADR authoring phase. Re-entering these from `approved` is
// legitimate when the PRD was approved first and the ADR is still being written
// (the PRD stays approved on its own axis, so this is not an un-approval).
const ADR_PHASE_STAGES = new Set(["adr-draft", "adr-review"]);

export function isForbiddenStageTransition(fromStage, toStage) {
  // Allow resuming ADR authoring after a PRD-first approval. The PRD approval is
  // still protected on the prd_status axis (approval events + status transitions),
  // so moving `approved` -> `adr-draft`/`adr-review` does not rewind it.
  if (fromStage === "approved" && ADR_PHASE_STAGES.has(toStage)) return false;
  return POST_APPROVAL_STAGES.has(fromStage) && PRE_APPROVAL_STAGES.has(toStage);
}

// Step separation between $prd-helper and $adr-helper is machine-enforced on the
// `stage` axis: the ADR may only be authored once the unit has explicitly entered
// the ADR phase (stage adr-draft) or later. Before that, adr.md stays the kickoff
// skeleton and the ADR-need decision lives in prd.md "## ADR 필요 여부". This stops
// a PRD session from drifting into ADR authoring.
export const ADR_AUTHORING_STAGES = new Set(["adr-draft", "adr-review", "approved", "implementing", "integrated"]);

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
  if (!content.startsWith("---\n")) {
    return `---\n${line}\n---\n\n${content}`;
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) return content;

  const frontmatter = content.slice(4, end);
  const rest = content.slice(end); // begins with "\n---"
  const keyPattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`);
  let replaced = false;
  const lines = frontmatter.split("\n").map((existing) => {
    if (!replaced && keyPattern.test(existing)) {
      replaced = true;
      return line;
    }
    return existing;
  });
  if (!replaced) lines.push(line);
  return `---\n${lines.join("\n")}${rest}`;
}

// state.md records each approval as one strict, regex-parseable line so the CLI
// (writer) and artifact-check (reader) share an unambiguous format. The verbatim
// user quote is everything after `::` on the line.
//   - APPROVAL prd 2026-07-02 harness:approve :: 응 이대로 승인, 구현 들어가
export const APPROVAL_EVENT_RE = /^- APPROVAL (prd|adr) (\d{4}-\d{2}-\d{2}) (\S+) :: (.+)$/;

export function formatApprovalEvent({ target, date, transport, quote }) {
  const oneLine = quote.replace(/\s+/g, " ").trim();
  return `- APPROVAL ${target} ${date} ${transport} :: ${oneLine}`;
}

export function parseApprovalEvents(content) {
  const events = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const match = APPROVAL_EVENT_RE.exec(rawLine.trim());
    if (match) {
      events.push({ target: match[1], date: match[2], transport: match[3], quote: match[4].trim() });
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

// Every distinct section declared across the project's feature/bugfix units.
// Its size decides the wiki layout: <=1 keeps everything in index.md, >=2 means
// the wiki is split into per-section files.
export function collectDeclaredSections() {
  const sections = new Set();
  for (const type of ["feature", "bugfix"]) {
    for (const dir of unitDirs(type)) {
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
