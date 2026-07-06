#!/usr/bin/env node
import path from "node:path";
import {
  fail,
  formatApprovalEvent,
  inferRawUnitFromBranch,
  parseArgs,
  parseFrontmatter,
  pathExists,
  rawUnitPath,
  readText,
  repoPath,
  setFrontmatterField,
  toPosix,
  today,
  validateTypeAndSlug,
  writeText,
} from "./lib.mjs";

// The ONLY sanctioned way to move a PRD to `approved` / an ADR to `accepted`.
// It refuses unless the artifact is genuinely awaiting approval, records the
// user's verbatim approval into state.md, and writes the frontmatter + ledger
// atomically. Hand-editing status instead of using this leaves an inconsistent
// ledger that `harness:check` fails — that is by design.
//
//   npm run harness:approve -- --unit docs/raw/feature/<slug> \
//     --quote "응 이대로 승인, 구현 들어가" [--adr]
//
// --quote MUST be the user's actual approval words (verbatim). Never synthesize
// it, never derive it from an intent/scope statement. If the user has not
// explicitly approved, do not run this command.

const args = parseArgs(process.argv.slice(2));

const unitArg = typeof args.unit === "string" ? args.unit : args._[0];
let unitDir;
if (unitArg) {
  unitDir = path.resolve(process.cwd(), unitArg);
} else {
  const { parsed } = inferRawUnitFromBranch();
  if (!parsed) fail("pass --unit docs/raw/feature/<slug> or run from a feature/<slug> branch");
  unitDir = rawUnitPath(parsed.type, parsed.slug);
}

const relativeUnit = toPosix(path.relative(repoPath("docs", "raw"), unitDir));
const [type, slug] = relativeUnit.split("/");
validateTypeAndSlug(type, slug);

if (type !== "feature") {
  fail(`harness:approve only applies to feature units (PRD/ADR approval); got ${type}/${slug}`);
}
if (!pathExists(unitDir)) {
  fail(`raw unit does not exist: ${relativeUnit}`);
}

const quote = typeof args.quote === "string" ? args.quote.trim() : "";
if (!quote) {
  fail('missing --quote "<사용자의 실제 승인 발화 verbatim>"; approval requires the user\'s explicit words');
}
if (quote.length < 2) {
  fail("approval --quote is too short to be a real approval utterance");
}
// Reject the canned examples that ship in the docs/code and any leftover
// template token, so a "plausible" approval cannot be produced by copy-paste.
const EXAMPLE_QUOTES = new Set(["응 이대로 승인, 구현 들어가", "<사용자 승인 발화>", "<발화>"]);
if (EXAMPLE_QUOTES.has(quote) || /\{[^}\n]{1,40}\}/.test(quote) || /^<.*>$/.test(quote)) {
  fail("approval --quote looks like a template/example, not a real approval utterance; pass the user's actual words");
}

const alsoAdr = Boolean(args.adr);
const date = typeof args.date === "string" ? args.date : today();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  fail("--date must be YYYY-MM-DD");
}
if (date > today()) {
  fail(`--date must not be in the future (got ${date}, today is ${today()})`);
}
// Constrain the provenance label to a known set so the state.md transport column
// stays trustworthy for a human auditor.
const ALLOWED_TRANSPORTS = new Set(["harness:approve", "AskUserQuestion", "deep-interview"]);
const transport = typeof args.transport === "string" ? args.transport : "harness:approve";
if (!ALLOWED_TRANSPORTS.has(transport)) {
  fail(`--transport must be one of: ${[...ALLOWED_TRANSPORTS].join(", ")}`);
}

const prdPath = path.join(unitDir, "prd.md");
const adrPath = path.join(unitDir, "adr.md");
const statePath = path.join(unitDir, "state.md");

for (const [label, filePath] of [
  ["prd.md", prdPath],
  ["adr.md", adrPath],
  ["state.md", statePath],
]) {
  if (!pathExists(filePath)) {
    fail(`feature unit is missing ${label}: ${relativeUnit} (run npm run harness:kickoff first)`);
  }
}

const prdContent = readText(prdPath);
const adrContent = readText(adrPath);
const stateContent = readText(statePath);

const prdStatus = parseFrontmatter(prdContent)?.status;
const adrStatus = parseFrontmatter(adrContent)?.status;

// Guard: only approve an artifact that has reached `review`, so a raw draft
// cannot jump straight to approved. This is a structural precondition, NOT proof
// of user intent — that is the caller's responsibility: --quote MUST be the
// user's explicit answer to an approval request naming this transition (see the
// prd-helper/feature-develop protocols). Never synthesize or infer it.
if (prdStatus !== "review" && prdStatus !== "approved") {
  fail(`PRD must be in "review" before approval (current: "${prdStatus}"). Take it through $prd-helper first.`);
}
if (alsoAdr && adrStatus !== "proposed" && adrStatus !== "accepted") {
  fail(`ADR must be in "proposed" before acceptance (current: "${adrStatus}").`);
}

const reason = sanitizeReason(quote);
const approvalValue = `"user:${date}:${reason}"`;

const done = [];
let nextPrd = prdContent;
let nextState = stateContent;
const approvalLines = [];

if (prdStatus === "review") {
  nextPrd = setFrontmatterField(nextPrd, "status", "approved");
  nextPrd = setFrontmatterField(nextPrd, "approval", approvalValue);
  nextState = setFrontmatterField(nextState, "prd_status", "approved");
  approvalLines.push(formatApprovalEvent({ target: "prd", date, transport, quote }));
  done.push("PRD review -> approved");
} else {
  done.push("PRD already approved (unchanged)");
}

let nextAdr = adrContent;
if (alsoAdr) {
  if (adrStatus === "proposed") {
    nextAdr = setFrontmatterField(nextAdr, "status", "accepted");
    nextAdr = setFrontmatterField(nextAdr, "approval", approvalValue);
    nextState = setFrontmatterField(nextState, "adr_status", "accepted");
    approvalLines.push(formatApprovalEvent({ target: "adr", date, transport, quote }));
    done.push("ADR proposed -> accepted");
  } else {
    done.push("ADR already accepted (unchanged)");
  }
}

if (approvalLines.length === 0) {
  console.log(`[harness:approve] nothing to do for ${relativeUnit}`);
  for (const line of done) console.log(`- ${line}`);
  process.exit(0);
}

nextState = setFrontmatterField(nextState, "stage", "approved");
nextState = recordApprovalEvents(nextState, approvalLines);
nextState = appendStageLog(nextState, `- ${date} approved: 사용자 명시 승인 (harness:approve)`);

writeText(prdPath, nextPrd);
if (alsoAdr) writeText(adrPath, nextAdr);
writeText(statePath, nextState);

console.log(`[harness:approve] ${relativeUnit}`);
for (const line of done) console.log(`- ${line}`);
console.log(`- approval: user:${date}:${reason}`);
console.log(`- quote recorded in state.md: ${quote.replace(/\s+/g, " ").trim()}`);

// Collapse the verbatim quote into a single frontmatter-safe reason excerpt. The
// full quote still lives verbatim in state.md; this is only the short reason
// stamped into the PRD/ADR `approval:` field, which must satisfy
// user:YYYY-MM-DD:<reason>.
function sanitizeReason(text) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/["#]/g, "")
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned || "사용자 명시 승인";
}

// Finds a real `## <name>` heading by matching at the start of a line, so a
// backtick mention of the heading inside the state.md rules prose (e.g.
// "아래 `## 승인 이벤트`에 …") is never mistaken for the heading itself.
function headingIndex(content, name) {
  const match = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*$`, "m").exec(content);
  return match ? match.index : -1;
}

// Replace the "(아직 승인 없음 …)" placeholder with the approval lines, or insert
// them right under the "## 승인 이벤트" heading when the placeholder is gone.
function recordApprovalEvents(content, lines) {
  const block = lines.join("\n");
  const placeholder = /^\(아직 승인 없음[^\n]*\)$/m;
  if (placeholder.test(content)) {
    return content.replace(placeholder, block);
  }
  const index = headingIndex(content, "## 승인 이벤트");
  if (index === -1) {
    return `${content.trimEnd()}\n\n## 승인 이벤트\n\n${block}\n`;
  }
  const lineEnd = content.indexOf("\n", index);
  const cut = lineEnd === -1 ? content.length : lineEnd;
  return `${content.slice(0, cut)}\n\n${block}${content.slice(cut)}`;
}

// Append a bullet at the end of the "## 단계 로그" section (before the next
// heading, or end of file).
function appendStageLog(content, line) {
  const index = headingIndex(content, "## 단계 로그");
  if (index === -1) return `${content.trimEnd()}\n${line}\n`;

  const nextHeading = content.indexOf("\n## ", content.indexOf("\n", index));
  const insertAt = nextHeading === -1 ? content.length : nextHeading;
  const before = content.slice(0, insertAt).trimEnd();
  const after = content.slice(insertAt);
  return `${before}\n${line}${after ? `\n${after.replace(/^\n+/, "")}` : "\n"}`;
}
