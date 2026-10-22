#!/usr/bin/env node
// 지식 계층 엔진 CLI. 소비 프로젝트 루트(cwd)에서 실행한다. 조회(brief/show/refs/status/pending)와
// 기록(scaffold/retire/record/seed)과 소급(bootstrap)을 맡고, 무엇이 지식인지의 판단은 스킬
// (knowledge-distill)이 한다 — 여기는 형식·ID·원장·게이트만 기계적으로 다룬다.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  KNOWLEDGE_VIA_VALUES,
  REPO_ROOT,
  bodyAfterFrontmatter,
  formatKnowledgeEvent,
  harnessPath,
  isGitRepo,
  isHarnessRepository,
  normalizeEol,
  parseAreaList,
  parseFrontmatter,
  parseKnowledgeEvents,
  pathExists,
  readText,
  repoPath,
  resolveTimezone,
  sectionFileName,
  setFrontmatterField,
  today,
  toPosix,
  writeText,
} from "./lib.mjs";
import {
  BOOTSTRAP_VERDICTS,
  COMMON_AREA,
  KIND_DIRS,
  MAX_SLUG_LENGTH,
  SKELETON,
  TOMBSTONE_STATES,
  appendKnowledgeEvent,
  bootstrapInProgress,
  declaredAreas,
  hasKnowledgeMarker,
  idDate,
  knowledgePath,
  knowledgeStatus,
  listPendingUnits,
  loadCatalog,
  makeFileIndex,
  parseAnchors,
  parseBootstrapLedger,
  readBootstrapFrontmatter,
  runKnowledgeGates,
} from "./knowledge-lib.mjs";

const INACTIVE_MESSAGE = "(지식 계층 미활성 — /lph-doctor 참고)";
const BRIEF_BYTE_CAP = 6000;
const DEFAULT_BRIEF_LIMIT = 12;
const DEFAULT_BATCH_TOKENS = 12000;
const UNIT_TOKEN_OVERHEAD = 400;
const UNREADABLE_RATIO_WARN = 0.3;

function die(message) {
  console.error(`[knowledge] ${message}`);
  process.exit(1);
}

// 키 하나가 값을 여러 개 받을 수 있는(`--paths a b c`) 인자 파서. lib.parseArgs는 값 하나만 받는다.
// 값 없는 스위치(BOOLEAN_FLAGS)는 뒤 토큰을 삼키지 않아 `bootstrap --force plan`의 하위 명령이 남고,
// ID 목록 플래그(LIST_FLAGS)는 공백으로 나뉜 값을 콤마로 이어 `--ids A B`가 ID 둘로 읽힌다.
const BOOLEAN_FLAGS = new Set(["force", "apply", "auto", "unconfirmed"]);
const LIST_FLAGS = new Set(["ids", "units", "invariants", "gotchas"]);

function parseCli(argv) {
  const positional = [];
  const flags = {};
  let key = null;
  for (const token of argv) {
    if (token.startsWith("--")) {
      key = token.slice(2);
      flags[key] = [];
      if (BOOLEAN_FLAGS.has(key)) key = null;
    } else if (key) {
      flags[key].push(token);
    } else {
      positional.push(token);
    }
  }
  const one = (name) => {
    const value = flags[name];
    if (!value) return undefined;
    return value.length === 0 ? true : value.join(LIST_FLAGS.has(name) ? "," : " ");
  };
  return { positional, flags, one, many: (name) => flags[name] ?? [], has: (name) => name in flags };
}

function requireWritable() {
  if (isHarnessRepository()) die("provider 저장소에서는 지식 계층을 만들지 않습니다 — 소비 프로젝트에서 실행하세요.");
}

// 조회 계열 공통 가드: 마커도 부트스트랩도 없으면 한 줄 안내 후 종료(exit 0).
function requireReadable() {
  if (hasKnowledgeMarker() || bootstrapInProgress()) return;
  console.log(INACTIVE_MESSAGE);
  process.exit(0);
}

function writable() {
  return hasKnowledgeMarker() || bootstrapInProgress();
}

function templateText(name, replacements = {}) {
  let text = readText(harnessPath("harness", "templates", "knowledge", name));
  for (const [key, value] of Object.entries(replacements)) text = text.replaceAll(`{${key}}`, value);
  return text;
}

function sha12(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
  return result.status === 0 ? result.stdout : null;
}

function activeIdsOrDie(ids, label) {
  const { byId } = loadCatalog();
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) die(`${label}: 활성 지식 ID가 아닙니다: ${unknown.join(", ")}`);
}

function splitIds(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry !== "none");
}

// ─── brief / show / refs ─────────────────────────────────────────────────────
function firstLineAfter(item, label) {
  const lines = item.lines;
  const marker = `**${label}:**`;
  for (let i = 0; i < lines.length; i += 1) {
    const at = lines[i].indexOf(marker);
    if (at === -1) continue;
    let value = lines[i].slice(at + marker.length).trim();
    for (let j = i + 1; !value && j < lines.length && !lines[j].startsWith("**"); j += 1) value = lines[j].trim();
    return value;
  }
  return "";
}

function briefEntry(item) {
  const label = item.kind === "G" ? "규칙" : "위반 시";
  const out = [`${item.id}: ${item.rawTitle}`];
  const line = firstLineAfter(item, label);
  if (line) out.push(`  ${label}: ${line.length > 200 ? `${line.slice(0, 200)}…` : line}`);
  if (item.meta?.["코드"]) out.push(`  코드: ${item.meta["코드"]}`);
  return out.join("\n");
}

function entryDate(item) {
  return item.meta?.["발견"] ?? idDate(item.id);
}

// 앵커·질의 경로 하나를 { path, isDir }로. 끝의 `/`이거나 워킹트리에서 디렉터리면 디렉터리다
// (K6이 디렉터리 앵커를 허용하므로 brief도 같은 눈으로 본다).
function describePath(raw) {
  const clean = raw.replace(/\/+$/, "");
  let isDir = clean !== raw;
  if (!isDir) {
    try {
      isDir = fs.statSync(repoPath(clean)).isDirectory();
    } catch {
      isDir = false;
    }
  }
  return { path: clean, isDir };
}

// 코드 앵커와 질의 경로의 근접도: 정확일치 3 > 같은 디렉터리(디렉터리 앵커 안의 파일 포함) 2 >
// 위 두 단계 공유 1. 디렉터리는 자기 자신을 "속한 디렉터리"로 본다.
function proximity(anchor, query) {
  if (!anchor.isDir && !query.isDir && anchor.path === query.path) return 3;
  const aDir = anchor.isDir ? anchor.path : path.posix.dirname(anchor.path);
  const qDir = query.isDir ? query.path : path.posix.dirname(query.path);
  if (aDir === qDir) return 2;
  if (anchor.isDir && query.path.startsWith(`${anchor.path}/`)) return 2;
  if (query.isDir && anchor.path.startsWith(`${query.path}/`)) return 2;
  const a = aDir.split("/");
  const q = qDir.split("/");
  if (a[0] !== "." && q[0] !== "." && a.length >= 2 && q.length >= 2 && a[0] === q[0] && a[1] === q[1]) return 1;
  return 0;
}

function scoreEntry(item, queryPaths) {
  const anchors = parseAnchors(item.meta?.["코드"]).items;
  let best = 0;
  for (const anchor of anchors) {
    const described = describePath(anchor.path);
    for (const queryPath of queryPaths) best = Math.max(best, proximity(described, queryPath));
  }
  return best;
}

// 질의 경로를 저장소 기준 상대경로로. 에이전트가 Read/Edit에서 쓰던 절대경로도 받고(macOS의
// /tmp → /private/tmp 같은 심볼릭 링크 차이는 realpath로 맞춘다), 저장소 밖이면 null.
function normalizeQueryPath(entry) {
  const roots = [REPO_ROOT];
  try {
    roots.push(fs.realpathSync(REPO_ROOT));
  } catch {
    // realpath 불가면 REPO_ROOT만 쓴다.
  }
  const absolute = path.resolve(REPO_ROOT, entry);
  const candidates = [absolute];
  try {
    candidates.push(fs.realpathSync(absolute));
  } catch {
    // 아직 없는 경로(새 파일)는 그대로 비교한다.
  }
  for (const candidate of candidates) {
    for (const root of roots) {
      const relative = toPosix(path.relative(root, candidate));
      if (relative && relative !== ".." && !relative.startsWith("../") && !path.isAbsolute(relative)) return relative;
    }
  }
  return null;
}

function printBrief(candidates, limit) {
  const shown = [];
  let used = 0;
  for (const item of candidates) {
    if (shown.length >= limit) break;
    const text = briefEntry(item);
    const bytes = Buffer.byteLength(text) + 1;
    if (shown.length > 0 && used + bytes > BRIEF_BYTE_CAP) break;
    shown.push(text);
    used += bytes;
  }
  if (shown.length > 0) console.log(shown.join("\n"));
  const omitted = candidates.length - shown.length;
  if (omitted > 0) console.log(`+${omitted}건 생략 — knowledge.mjs show <ID>`);
}

function cmdBrief(cli) {
  requireReadable();
  const catalog = loadCatalog();
  const limit = Number(cli.one("limit")) || DEFAULT_BRIEF_LIMIT;
  const byRecency = (a, b) => entryDate(b).localeCompare(entryDate(a)) || a.id.localeCompare(b.id);

  if (cli.has("ids")) {
    const wanted = splitIds(cli.one("ids"));
    const found = wanted.map((id) => catalog.byId.get(id)).filter(Boolean);
    printBrief(found, limit);
    for (const id of wanted.filter((entry) => !catalog.byId.has(entry))) {
      const tomb = catalog.tombById.get(id);
      console.log(tomb ? `${id}: (비활성 — ${tomb.state}${tomb.to ? ` → ${tomb.to}` : ""})` : `${id}: (없음)`);
    }
    return;
  }
  if (cli.has("area")) {
    const area = cli.one("area");
    const matches = catalog.entries.filter((item) => item.areas.includes(area) || item.fileArea === area).sort(byRecency);
    if (matches.length === 0) console.log("(관련 항목 없음)");
    else printBrief(matches, limit);
    return;
  }
  const rawPaths = cli.many("paths");
  if (rawPaths.length === 0) die("brief는 --paths <파일…> | --area <영역> | --ids <ID,…> 중 하나가 필요합니다.");
  const normalized = rawPaths.map((entry) => [entry, normalizeQueryPath(toPosix(entry))]);
  const outside = normalized.filter(([, value]) => value === null).map(([entry]) => entry);
  if (outside.length > 0) console.error(`[knowledge] 저장소 밖 경로는 무시합니다: ${outside.join(", ")}`);
  const queryPaths = normalized.filter(([, value]) => value !== null).map(([, value]) => describePath(value));
  const ranked = catalog.entries
    .map((item) => ({ item, score: scoreEntry(item, queryPaths) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || byRecency(a.item, b.item));
  if (ranked.length === 0) console.log("(관련 항목 없음)");
  else printBrief(ranked.map(({ item }) => item), limit);
}

function cmdShow(cli) {
  requireReadable();
  const catalog = loadCatalog();
  let missing = false;
  for (const id of cli.positional.slice(1)) {
    const item = catalog.byId.get(id);
    const tomb = catalog.tombById.get(id);
    if (item) console.log(`# ${item.file}\n${item.text}\n`);
    else if (tomb) console.log(`묘비: ${tomb.id} | ${tomb.state} | ${tomb.to ?? "-"} | ${tomb.reason}`);
    else {
      console.log(`(없음) ${id}`);
      missing = true;
    }
  }
  if (missing) process.exitCode = 1;
}

function cmdRefs(cli) {
  requireReadable();
  const catalog = loadCatalog();
  let missing = false;
  for (const id of cli.positional.slice(1)) {
    if (catalog.byId.has(id)) console.log(`ok ${id}`);
    else if (catalog.tombById.has(id)) console.log(`tombstone ${id} (${catalog.tombById.get(id).state})`);
    else {
      console.log(`unknown ${id}`);
      missing = true;
    }
  }
  if (missing) process.exitCode = 1;
}

// ─── scaffold / retire ───────────────────────────────────────────────────────
function entrySkeleton(kind, id, title, areaList, dateText) {
  if (kind === "G") {
    return [
      `### ${id}: ${title}`,
      `> 발견: ${dateText} · 유형: ${SKELETON.gotchaType} · area: ${areaList} · 출처: ${SKELETON.source} · 코드: ${SKELETON.code}`,
      "",
      `**규칙:** ${SKELETON.rule}`,
      "",
      `**왜:** ${SKELETON.why}`,
    ].join("\n");
  }
  return [
    `### ${id}: ${title}`,
    `> area: ${areaList} · 출처: ${SKELETON.invSource} · 코드: ${SKELETON.code} · 봉인: ${SKELETON.seal}`,
    "",
    `**위반 시:** ${SKELETON.violation}`,
  ].join("\n");
}

function cmdScaffold(cli) {
  requireWritable();
  if (!writable()) die("지식 계층이 활성이 아닙니다 — `knowledge.mjs seed` 또는 `bootstrap plan`을 먼저 실행하세요.");
  const kind = cli.one("kind");
  const slug = cli.one("slug");
  const areaFlag = cli.one("area");
  if (!KIND_DIRS[kind]) die("--kind는 G | INV 여야 합니다.");
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > MAX_SLUG_LENGTH) {
    die(`--slug는 kebab-case(소문자·숫자·하이픈) ${MAX_SLUG_LENGTH}자 이하여야 합니다.`);
  }
  if (typeof areaFlag !== "string") die("--area <영역>이 필요합니다(공통은 _common).");

  const areas = parseAreaList(areaFlag);
  if (areas.length === 0) die("--area 값이 비어 있습니다.");
  const declared = declaredAreas();
  for (const area of areas) {
    if (area !== COMMON_AREA && !declared.has(area)) {
      die(`area "${area}"는 어떤 raw 단위도 선언하지 않았습니다 — prd/bugfix frontmatter의 area와 일치해야 합니다(공통은 _common).`);
    }
  }
  const fileName = sectionFileName(areas[0]);
  if (!fileName) die(`area "${areas[0]}"를 파일명으로 변환할 수 없습니다.`);

  const dateText = today(resolveTimezone());
  const id = `${kind}-${dateText.slice(2, 4)}${dateText.slice(5, 7)}${dateText.slice(8, 10)}-${slug}`;
  const catalog = loadCatalog();
  if (catalog.byId.has(id) || catalog.tombById.has(id)) die(`ID가 이미 있습니다: ${id} — slug를 바꾸세요.`);

  const filePath = knowledgePath(KIND_DIRS[kind], fileName);
  let content = pathExists(filePath)
    ? readText(filePath)
    : templateText("area.md", { area: areas[0], label: kind === "G" ? "함정" : "불변식" });
  const title = cli.one("title") && cli.one("title") !== true ? cli.one("title") : SKELETON.title;
  const heading = cli.has("unconfirmed") ? `${title} (미확인)` : title;
  content = `${content.trimEnd()}\n\n${entrySkeleton(kind, id, heading, areas.join(", "), dateText)}\n`;
  writeText(filePath, content);
  console.log(id);
  console.log(`  → ${toPosix(path.relative(REPO_ROOT, filePath))} (골격 추가 — 메타·본문의 {…}를 채우세요)`);
}

function cmdRetire(cli) {
  requireWritable();
  if (!writable()) die("지식 계층이 활성이 아닙니다.");
  const id = cli.one("id");
  const state = cli.one("state");
  const to = cli.one("to");
  const reason = cli.one("reason");
  if (typeof id !== "string") die("--id <ID>가 필요합니다.");
  if (!TOMBSTONE_STATES.includes(state)) die(`--state는 ${TOMBSTONE_STATES.join(" | ")} 중 하나여야 합니다.`);
  if (typeof reason !== "string" || !reason.trim()) die('--reason "<사유>"가 필요합니다.');

  const catalog = loadCatalog();
  const item = catalog.byId.get(id);
  if (!item) die(catalog.tombById.has(id) ? `이미 비활성입니다: ${id}` : `활성 항목이 아닙니다: ${id}`);
  if (state !== "폐기") {
    if (typeof to !== "string") die(`${state}에는 --to <대체 ID>가 필요합니다.`);
    if (to === id) die("--to는 자기 자신일 수 없습니다.");
    if (!catalog.byId.has(to)) die(`--to는 활성 ID여야 합니다: ${to}`);
  }

  const file = catalog.files.find((entry) => entry.rel === item.file);
  const lines = file.content.split("\n");
  const kept = [...lines.slice(0, item.startIndex), ...lines.slice(item.startIndex + item.lines.length)];
  writeText(file.path, `${kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`);

  const tombPath = knowledgePath("_tombstones.md");
  const base = pathExists(tombPath) ? readText(tombPath) : templateText("tombstones.md");
  const cell = (value) => value.replace(/\s*\n\s*/g, " ").replace(/\|/g, "/").trim();
  writeText(tombPath, `${base.trimEnd()}\n| ${id} | ${state} | ${state === "폐기" ? (typeof to === "string" ? cell(to) : "-") : to} | ${cell(reason)} |\n`);
  console.log(`retire: ${id} → ${state}${state === "폐기" ? "" : ` (${to})`}`);
}

// ─── reanchor ────────────────────────────────────────────────────────────────
// 이름이 바뀐 파일을 git 이력으로 따라간다. 로그는 최신순이라, 같은 옛 경로의 이름 변경이
// 여러 번이면 가장 최근 것이 이긴다.
// 아직 커밋하지 않은 이름 변경(`git mv` 직후, 인덱스·워킹트리 vs HEAD)이 가장 최신이라 먼저 넣는다 —
// rename을 담은 그 커밋이 pre-commit의 K6에 막히므로 커밋 이력만으론 가장 흔한 경로를 못 고친다.
function renameMap() {
  const map = new Map();
  const collect = (out) => {
    for (const line of (out ?? "").split("\n")) {
      const parts = line.split("\t");
      if (parts.length === 3 && parts[0].startsWith("R") && !map.has(parts[1])) map.set(parts[1], parts[2]);
    }
  };
  collect(git(["-c", "core.quotepath=false", "diff", "-M", "--name-status", "HEAD"]));
  collect(git(["-c", "core.quotepath=false", "log", "-M", "--diff-filter=R", "--name-status", "--format="]));
  return map;
}

function followRename(start, map, index) {
  let current = start;
  const seen = new Set();
  while (map.has(current) && !seen.has(current)) {
    seen.add(current);
    current = map.get(current);
    if (index.has(current)) return current;
  }
  return null;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cmdReanchor(cli) {
  requireReadable();
  const apply = cli.has("apply");
  if (apply) requireWritable();
  const catalog = loadCatalog();
  const index = makeFileIndex();
  const map = isGitRepo() ? renameMap() : new Map();
  const fixes = [];
  let broken = 0;

  for (const item of catalog.entries) {
    for (const key of ["코드", "봉인"]) {
      for (const anchor of parseAnchors(item.meta?.[key]).items) {
        if (index.has(anchor.path)) continue;
        broken += 1;
        const found = followRename(anchor.path, map, index);
        console.log(found ? `${item.id}: ${anchor.path} → ${found}` : `${item.id}: ${anchor.path} (이동 이력 없음)`);
        if (found) fixes.push({ item, from: anchor.path, to: found });
      }
    }
  }
  if (broken === 0) {
    console.log("끊긴 앵커 없음");
    return;
  }
  if (!apply) {
    if (fixes.length > 0) console.log(`제안 ${fixes.length}건 — 적용하려면 reanchor --apply`);
    return;
  }
  const byFile = new Map();
  for (const fix of fixes) byFile.set(fix.item.file, [...(byFile.get(fix.item.file) ?? []), fix]);
  for (const [fileRel, list] of byFile) {
    const file = catalog.files.find((entry) => entry.rel === fileRel);
    const lines = file.content.split("\n");
    for (const fix of list) {
      for (let i = fix.item.startIndex + 1; i < fix.item.startIndex + fix.item.lines.length; i += 1) {
        if (!lines[i].startsWith("> ")) continue;
        lines[i] = lines[i].replace(new RegExp(`\`${escapeRegExp(fix.from)}(?=[\`:])`, "g"), `\`${fix.to}`);
        break;
      }
    }
    writeText(file.path, lines.join("\n"));
  }
  console.log(`적용 ${fixes.length}건 · 남은 끊김 ${broken - fixes.length}건`);
}

// ─── record / pending / seed / status / check ───────────────────────────────
function noteSectionIsEmpty(notes) {
  const lines = bodyAfterFrontmatter(notes).split("\n");
  const start = lines.findIndex((line) => /^##\s+지식 후보\s*$/.test(line));
  if (start === -1) return true;
  const body = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i += 1) body.push(lines[i]);
  return body
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .every((line) => /^\s*$/.test(line) || /^\s*>/.test(line) || /^\s*[-*]\s*$/.test(line));
}

function autoJudgment(unitDir, type) {
  if (type === "chore") return true;
  if (type === "bugfix") return false;
  const notesPath = path.join(unitDir, "notes.md");
  if (pathExists(notesPath) && !noteSectionIsEmpty(readText(notesPath))) return false;
  const adrPath = path.join(unitDir, "adr.md");
  return !(pathExists(adrPath) && parseFrontmatter(readText(adrPath))?.status === "accepted");
}

function cmdRecord(cli) {
  requireWritable();
  if (!writable()) {
    console.log(INACTIVE_MESSAGE);
    return;
  }
  const unit = cli.one("unit");
  const via = cli.one("via");
  if (typeof unit !== "string") die("--unit docs/raw/<type>/<slug> 가 필요합니다.");
  if (!KNOWLEDGE_VIA_VALUES.includes(via)) die(`--via는 ${KNOWLEDGE_VIA_VALUES.join(" | ")} 중 하나여야 합니다.`);
  const match = /^docs\/raw\/(feature|bugfix|chore)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(toPosix(unit));
  if (!match) die(`--unit 형식이 맞지 않습니다: ${unit}`);
  const unitDir = repoPath("docs", "raw", match[1], match[2]);
  if (!pathExists(unitDir)) die(`단위가 없습니다: ${unit}`);
  const statePath = path.join(unitDir, "state.md");
  if (!pathExists(statePath)) die("state.md가 없는 단위입니다 — 레거시 단위는 bootstrap 원장으로 처리하세요.");

  const original = readText(statePath);
  let invariants;
  let gotchas;
  if (cli.has("auto")) {
    // 재시도·세션 재개·one-shot 재진입에서 이미 기록된 단위를 다시 판정하지 않는다.
    if (parseKnowledgeEvents(original).length > 0) {
      console.log("already-recorded");
      return;
    }
    if (!autoJudgment(unitDir, match[1])) {
      console.log("needs-judgment");
      return;
    }
    invariants = "none(auto)";
    gotchas = "none(auto)";
  } else {
    invariants = splitIds(cli.one("invariants"));
    gotchas = splitIds(cli.one("gotchas"));
    activeIdsOrDie([...invariants, ...gotchas], "record");
  }
  const line = formatKnowledgeEvent({ date: today(resolveTimezone()), invariants, gotchas, via });
  const updated = appendKnowledgeEvent(original, line);
  if (updated === original) {
    console.log("이미 기록됨(동일한 줄)");
    return;
  }
  writeText(statePath, updated);
  console.log(cli.has("auto") ? "auto: none(auto) 기록" : `기록: ${line.slice(2)}`);
}

function cmdPending() {
  if (!hasKnowledgeMarker()) {
    console.log(INACTIVE_MESSAGE);
    return;
  }
  const pending = listPendingUnits();
  console.log(`pending=${pending.length}`);
  for (const unit of pending) console.log(`- ${unit.rel}`);
}

function cmdSeed() {
  requireWritable();
  if (bootstrapInProgress()) die("bootstrap이 진행 중입니다 — finalize가 마커를 만듭니다.");
  if (hasKnowledgeMarker()) {
    console.log("seed: 이미 시드됨(변경 없음)");
    return;
  }
  writeText(knowledgePath("index.md"), templateText("index.md"));
  if (!pathExists(knowledgePath("_tombstones.md"))) writeText(knowledgePath("_tombstones.md"), templateText("tombstones.md"));
  console.log("seed: docs/knowledge/index.md · _tombstones.md 생성");
}

function cmdStatus() {
  const status = knowledgeStatus();
  console.log(`knowledge=${status.state}`);
  const areas = Object.entries(status.areaCounts).map(([area, count]) => `${area} G${count.G}·INV${count.INV}`);
  console.log(`영역별 활성: ${areas.length > 0 ? areas.join(", ") : "(없음)"}`);
  console.log(`pending: ${status.pendingCount}건`);
  console.log(`final 단위: ${status.finalUnitCount}`);
  if (status.legacyGotchasFiles.length > 0) console.log(`기존 gotchas 파일: ${status.legacyGotchasFiles.join(", ")}`);
}

function cmdCheck() {
  const { errors, warnings } = runKnowledgeGates();
  for (const message of warnings) console.log(`warning: ${message}`);
  for (const message of errors) console.log(`error: ${message}`);
  console.log(errors.length === 0 ? "ok" : `${errors.length}건 오류`);
  if (errors.length > 0) process.exitCode = 1;
}

// ─── bootstrap ───────────────────────────────────────────────────────────────
const EXCERPT_SECTIONS = {
  "adr.md": ["결정", "결과"],
  "prd.md": ["요구사항", "수용 기준"],
  "bugfix.md": ["원인", "회귀 방지"],
  "notes.md": ["결정", "지식 후보"],
};

// git cat-file --batch 한 번으로 base 시점 blob들을 읽는다(단위 수백 개를 프로세스 수백 번 없이).
function gitBlobs(base, paths) {
  const result = new Map();
  if (paths.length === 0) return result;
  const run = spawnSync("git", ["cat-file", "--batch"], {
    cwd: REPO_ROOT,
    input: paths.map((entry) => `${base}:${entry}\n`).join(""),
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (run.status !== 0) return result;
  const buffer = run.stdout;
  let offset = 0;
  for (const entry of paths) {
    const end = buffer.indexOf(0x0a, offset);
    if (end === -1) break;
    const header = buffer.toString("utf8", offset, end);
    offset = end + 1;
    const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (!match) {
      result.set(entry, null);
      continue;
    }
    const size = Number(match[1]);
    result.set(entry, normalizeEol(buffer.toString("utf8", offset, offset + size)));
    offset += size + 1;
  }
  return result;
}

function extractSections(content, names) {
  const lines = bodyAfterFrontmatter(content).split("\n");
  const out = [];
  for (const name of names) {
    const start = lines.findIndex((line) => new RegExp(`^##\\s+${escapeRegExp(name)}\\s*$`).test(line));
    if (start === -1) continue;
    let end = start + 1;
    while (end < lines.length && !/^##\s/.test(lines[end])) end += 1;
    const text = lines.slice(start, end).join("\n").trim();
    if (text) out.push(text);
  }
  return out.join("\n\n");
}

// 바이트 예산으로 자르되 멀티바이트 문자 중간(U+FFFD)에서 끊지 않는다.
function truncateUtf8(text, maxBytes) {
  const buffer = Buffer.from(text);
  if (buffer.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end -= 1;
  return buffer.subarray(0, end).toString("utf8");
}

function unitExcerpt(unit, blobs) {
  const parts = [];
  for (const fileName of ["prd.md", "adr.md", "bugfix.md", "notes.md"]) {
    const content = blobs.get(`${unit}/${fileName}`);
    if (!content) continue;
    const text = extractSections(content, EXCERPT_SECTIONS[fileName]);
    if (text) parts.push(`[${fileName}]\n${text}`);
  }
  return parts.join("\n\n");
}

// base 커밋 시점의 부트스트랩 대상 단위를 계산한다: final feature/bugfix + 모든 chore.
// 결과는 git 디렉터리 캐시(plan.json)에 base_commit 키로 저장돼 같은 base에선 재계산을 건너뛴다.
function planCachePath() {
  const out = git(["rev-parse", "--git-path", "lph-knowledge-bootstrap/plan.json"]);
  return out ? path.resolve(REPO_ROOT, out.trim()) : null;
}

function readPlanCache(base) {
  try {
    const cachePath = planCachePath();
    if (!cachePath || !pathExists(cachePath)) return null;
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    return cached.base_commit === base ? cached : null;
  } catch {
    return null;
  }
}

function writePlanCache(plan) {
  try {
    const cachePath = planCachePath();
    if (!cachePath) return;
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(plan), "utf8");
  } catch {
    // 캐시는 최적화일 뿐이라 실패해도 계획 계산에는 영향이 없다.
  }
}

function planHashOf(unitPaths) {
  return sha12([...unitPaths].sort().join("\n"));
}

function resolveBase(base) {
  const sha = git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  if (!sha) die(`base_commit을 읽을 수 없습니다: ${base} (이력이 사라졌다면 bootstrap plan --force)`);
  return sha.trim();
}

function computePlan(baseInput) {
  const base = resolveBase(baseInput);
  const cached = readPlanCache(base);
  if (cached) return cached;

  const listed = git(["ls-tree", "-r", "-z", "--name-only", base, "--", "docs/raw"]);
  if (listed === null) die("git ls-tree 실패 — git 저장소의 커밋이 필요합니다.");
  const byUnit = new Map();
  for (const file of listed.split("\0")) {
    const match = /^(docs\/raw\/(feature|bugfix|chore)\/([^/]+))\/([^/]+\.md)$/.exec(file);
    if (!match) continue;
    if (!byUnit.has(match[1])) byUnit.set(match[1], { type: match[2], files: [] });
    byUnit.get(match[1]).files.push(match[4]);
  }

  const unitPaths = [...byUnit.keys()].sort();
  const blobs = gitBlobs(
    base,
    unitPaths.flatMap((unit) => byUnit.get(unit).files.map((name) => `${unit}/${name}`)),
  );

  const dates = new Map();
  const log = git(["-c", "core.quotepath=false", "log", base, "--diff-filter=A", "--name-only", "--format=%x00%cs", "--", "docs/raw"]) ?? "";
  for (const chunk of log.split("\0")) {
    const [date, ...names] = chunk.split("\n").filter(Boolean);
    for (const name of names) if (!dates.has(name)) dates.set(name, date);
  }

  const units = [];
  for (const unit of unitPaths) {
    const { type, files } = byUnit.get(unit);
    const primary = type === "feature" ? "prd.md" : type === "bugfix" ? "bugfix.md" : files.includes("notes.md") ? "notes.md" : [...files].sort()[0];
    const primaryContent = blobs.get(`${unit}/${primary}`);
    const fm = primaryContent ? (parseFrontmatter(primaryContent) ?? {}) : {};
    if (type === "feature" && fm.status !== "approved") continue;
    if (type === "bugfix" && fm.status !== "fixed") continue;
    const areas = parseAreaList(fm.area);
    units.push({
      unit,
      type,
      area: areas.length > 0 ? areas.join(",") : COMMON_AREA,
      date: dates.get(`${unit}/${primary}`) ?? fm.date ?? "0000-00-00",
      excerptBytes: type === "chore" ? 0 : Buffer.byteLength(unitExcerpt(unit, blobs)),
    });
  }
  const plan = { base_commit: base, plan_hash: planHashOf(units.map((entry) => entry.unit)), units };
  writePlanCache(plan);
  return plan;
}

function ledgerRowText(row) {
  const cell = (value) => (value ? String(value).replace(/\|/g, "/").replace(/\s*\n\s*/g, " ") : "-");
  return `| ${row.unit} | ${cell(row.area)} | ${row.date} | ${row.verdict} | ${row.ids?.length ? row.ids.join(",") : "-"} | ${cell(row.note)} |`;
}

function readLedger() {
  const ledgerPath = knowledgePath("bootstrap.md");
  if (!pathExists(ledgerPath)) die("bootstrap.md가 없습니다 — `bootstrap plan`을 먼저 실행하세요.");
  const content = readText(ledgerPath);
  return { ledgerPath, content, frontmatter: parseFrontmatter(content) ?? {}, ...parseBootstrapLedger(content) };
}

function firstArea(row) {
  return row.area.split(",")[0].trim() || COMMON_AREA;
}

function cmdBootstrapPlan(cli) {
  requireWritable();
  if (!isGitRepo()) die("git 저장소에서만 계획할 수 있습니다.");
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (!head) die("커밋이 없는 저장소입니다.");
  const force = cli.has("force");
  if (cli.has("pr-source") && !["gh", "none"].includes(cli.one("pr-source"))) die("--pr-source는 gh | none 이어야 합니다.");
  let prSource = cli.one("pr-source") === "gh" ? "gh" : "none";

  let previous = new Map();
  const existing = readBootstrapFrontmatter();
  if (existing?.status === "complete" || readMarkerBootstrap() === "complete") {
    die("이미 bootstrap이 완료됐습니다.");
  }
  if (existing?.status === "in-progress") {
    if (!force) die("이미 bootstrap이 진행 중입니다 — 재계산하려면 --force (기존 판정은 보존).");
    previous = new Map(readLedger().rows.map((row) => [row.unit, row]));
    // 플래그를 생략한 --force 재계산이 기존 설정을 조용히 none으로 되돌리지 않게 승계한다.
    if (!cli.has("pr-source")) prSource = existing.pr_source === "gh" ? "gh" : "none";
  }

  const base = head.trim();
  const plan = computePlan(base);
  const rows = plan.units.map((entry) => {
    const old = previous.get(entry.unit);
    const auto = entry.type === "chore";
    return {
      unit: entry.unit,
      area: entry.area,
      date: entry.date,
      verdict: old ? old.verdict : auto ? "무기여(auto)" : "대기",
      ids: old ? old.ids : [],
      note: old ? old.note : auto ? "chore 자동" : "",
    };
  });
  rows.sort((a, b) => a.unit.localeCompare(b.unit));
  const header = templateText("bootstrap.md", {
    status: "in-progress",
    base_commit: plan.base_commit,
    plan_hash: plan.plan_hash,
    cutoff: today(resolveTimezone()),
    pr_source: prSource,
  });
  writeText(knowledgePath("bootstrap.md"), `${header.trimEnd()}\n${rows.map(ledgerRowText).join("\n")}\n`);

  const dropped = [...previous.keys()].filter((unit) => !rows.some((row) => row.unit === unit));
  const counts = { feature: 0, bugfix: 0, chore: 0 };
  for (const entry of plan.units) counts[entry.type] += 1;
  const byArea = new Map();
  let tokens = 0;
  for (const entry of plan.units) {
    if (entry.type === "chore") continue;
    const cost = Math.ceil(entry.excerptBytes / 4) + UNIT_TOKEN_OVERHEAD;
    tokens += cost;
    const key = entry.area.split(",")[0];
    byArea.set(key, { units: (byArea.get(key)?.units ?? 0) + 1, tokens: (byArea.get(key)?.tokens ?? 0) + cost });
  }
  let batches = 0;
  for (const info of byArea.values()) batches += Math.ceil(info.tokens / DEFAULT_BATCH_TOKENS);
  console.log(`[bootstrap plan] base=${plan.base_commit.slice(0, 7)} plan_hash=${plan.plan_hash} 대상 ${plan.units.length}단위 (feature ${counts.feature} · bugfix ${counts.bugfix} · chore ${counts.chore})`);
  for (const [area, info] of [...byArea].sort(([a], [b]) => a.localeCompare(b))) console.log(`  영역 ${area}: ${info.units}단위`);
  console.log(`예상 토큰 ≈ ${tokens} · 권장 배치 수 ≈ ${batches} (--max-tokens ${DEFAULT_BATCH_TOKENS})`);
  if (force && dropped.length > 0) console.log(`제외된 단위 ${dropped.length}건(이전 원장에만 있던 행)`);
  console.log(`원장: docs/knowledge/bootstrap.md — 다음: bootstrap next-batch`);
  console.log("주의: in-progress 원장은 베이스 브랜치에 병합할 수 없습니다(K9) — 작업 브랜치에서 finalize까지 진행하세요.");
}

function readMarkerBootstrap() {
  return hasKnowledgeMarker() ? parseFrontmatter(readText(knowledgePath("index.md")))?.bootstrap : undefined;
}

function cmdBootstrapNextBatch(cli) {
  requireWritable();
  const { frontmatter, rows } = readLedger();
  const pending = rows.filter((row) => row.verdict === "대기");
  const knownAreas = [...new Set(rows.map(firstArea))].sort();
  // 오타난 영역이 `done`으로 읽혀 영역을 끝난 것으로 오인하지 않게, 원장에 없는 영역은 오류로 낸다.
  if (typeof cli.one("area") === "string" && !knownAreas.includes(cli.one("area"))) {
    die(`원장에 없는 영역입니다: ${cli.one("area")} — 원장의 영역: ${knownAreas.join(", ") || "(없음)"}`);
  }
  if (pending.length === 0) {
    console.log("done");
    return;
  }
  const maxTokens = Number(cli.one("max-tokens")) || DEFAULT_BATCH_TOKENS;
  let area = cli.one("area");
  if (typeof area !== "string") {
    const earliest = new Map();
    for (const row of pending) {
      const key = firstArea(row);
      if (!earliest.has(key) || row.date < earliest.get(key)) earliest.set(key, row.date);
    }
    area = [...earliest].sort(([ka, da], [kb, db]) => da.localeCompare(db) || ka.localeCompare(kb))[0][0];
  }
  const selected = pending
    .filter((row) => firstArea(row) === area)
    .sort((a, b) => a.date.localeCompare(b.date) || a.unit.localeCompare(b.unit));
  if (selected.length === 0) {
    console.log("done");
    return;
  }

  const base = resolveBase(frontmatter.base_commit);
  const paths = selected.flatMap((row) => ["prd.md", "adr.md", "bugfix.md", "notes.md"].map((name) => `${row.unit}/${name}`));
  const blobs = gitBlobs(base, paths);
  const budget = maxTokens * 4;
  let used = 0;
  const blocks = [];
  for (const row of selected) {
    let excerpt = unitExcerpt(row.unit, blobs) || "(발췌 가능한 섹션 없음)";
    const header = `=== 단위: ${row.unit} (${row.date} · 영역 ${row.area}) ===`;
    const room = budget - used - Buffer.byteLength(header);
    if (blocks.length > 0 && Buffer.byteLength(excerpt) > room) break;
    if (Buffer.byteLength(excerpt) > Math.max(room, 0) && blocks.length === 0) {
      excerpt = `${truncateUtf8(excerpt, Math.max(budget - Buffer.byteLength(header), 400))}\n…(잘림 — 원본: ${row.unit})`;
    }
    blocks.push(`${header}\n${excerpt}`);
    used += Buffer.byteLength(header) + Buffer.byteLength(excerpt);
  }
  console.log(`[bootstrap next-batch] 영역 ${area} · ${blocks.length}단위 · pr_source=${frontmatter.pr_source ?? "none"}`);
  console.log(blocks.join("\n\n"));
  console.log(`\n--- 영역 ${area} 현재 활성 항목 ---`);
  const catalog = loadCatalog();
  const active = catalog.entries.filter((item) => item.areas.includes(area) || item.fileArea === area);
  if (active.length === 0) console.log("(없음)");
  else printBrief(active, DEFAULT_BRIEF_LIMIT);
  console.log(`\n남은 대기 ${pending.length - blocks.length}건 (이 배치 ${blocks.length}건 제외)`);
}

function cmdBootstrapMark(cli) {
  requireWritable();
  const verdict = cli.one("verdict");
  if (!BOOTSTRAP_VERDICTS.includes(verdict)) die(`--verdict는 ${BOOTSTRAP_VERDICTS.join(" | ")} 중 하나여야 합니다.`);
  const wanted = splitIds(cli.one("units"));
  if (wanted.length === 0) die("--units <u,…>가 필요합니다.");
  const ids = splitIds(cli.one("ids"));
  if (verdict === "기여" && ids.length === 0) die("기여 판정에는 --ids <ID,…>가 필요합니다.");
  if (ids.length > 0) activeIdsOrDie(ids, "mark");
  const note = typeof cli.one("note") === "string" ? cli.one("note") : "";

  const ledger = readLedger();
  if (ledger.frontmatter.status !== "in-progress") die("진행 중인 bootstrap이 아닙니다.");
  const lines = [...ledger.lines];
  for (const unit of wanted) {
    const row = ledger.rows.find((entry) => entry.unit === unit);
    if (!row) die(`원장에 없는 단위입니다: ${unit}`);
    lines[row.line] = ledgerRowText({ ...row, verdict, ids: ids.length > 0 ? ids : row.ids, note: note || row.note });
  }
  writeText(ledger.ledgerPath, lines.join("\n"));
  const remaining = parseBootstrapLedger(lines.join("\n")).rows.filter((row) => row.verdict === "대기").length;
  console.log(`mark: ${wanted.length}행 갱신 (남은 대기 ${remaining})`);
}

function verdictDistribution(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.verdict, (counts.get(row.verdict) ?? 0) + 1);
  return counts;
}

// 원장 frontmatter plan_hash ↔ base_commit에서 재계산한 대상 ↔ 원장 행 집합, 세 가지가 일치해야 한다.
function planDrift(ledger) {
  const plan = computePlan(ledger.frontmatter.base_commit);
  const rowsHash = planHashOf(ledger.rows.map((row) => row.unit));
  return {
    plan,
    drift: plan.plan_hash !== ledger.frontmatter.plan_hash || rowsHash !== ledger.frontmatter.plan_hash,
  };
}

function cmdBootstrapStatus() {
  requireWritable();
  const ledger = readLedger();
  const { plan, drift } = planDrift(ledger);
  console.log(`[bootstrap status] base=${String(ledger.frontmatter.base_commit).slice(0, 7)} plan_hash=${ledger.frontmatter.plan_hash} status=${ledger.frontmatter.status}`);
  if (drift) console.log(`경고: plan 변경됨 — bootstrap plan --force (재계산 ${plan.plan_hash})`);
  const counts = verdictDistribution(ledger.rows);
  console.log(`판정: ${[...counts].map(([verdict, count]) => `${verdict} ${count}`).join(" · ") || "(없음)"}`);
  const total = ledger.rows.length;
  const decided = total - (counts.get("대기") ?? 0);
  console.log(`커버리지: ${decided}/${total} (${total === 0 ? 100 : Math.round((decided / total) * 100)}%)`);
  console.log(`남은 대기: ${counts.get("대기") ?? 0}`);
}

function cmdBootstrapFinalize() {
  requireWritable();
  const ledger = readLedger();
  if (ledger.frontmatter.status !== "in-progress") die("진행 중인 bootstrap이 아닙니다.");
  const counts = verdictDistribution(ledger.rows);
  if ((counts.get("대기") ?? 0) > 0) die(`판정 대기 행이 ${counts.get("대기")}건 남았습니다 — next-batch/mark로 마저 처리하세요.`);
  const { plan, drift } = planDrift(ledger);
  if (drift) die(`plan_hash가 일치하지 않습니다(재계산 ${plan.plan_hash}) — bootstrap plan --force`);

  const { errors, warnings } = runKnowledgeGates({ assumeMarker: true, branchGates: false });
  for (const message of warnings) console.log(`warning: ${message}`);
  if (errors.length > 0) {
    for (const message of errors) console.error(`error: ${message}`);
    die(`지식 게이트 오류 ${errors.length}건 — 해결 후 다시 finalize 하세요.`);
  }
  const unreadable = counts.get("판정불가") ?? 0;
  if (ledger.rows.length > 0 && unreadable / ledger.rows.length > UNREADABLE_RATIO_WARN) {
    console.log(`warning: 판정불가 비율이 ${Math.round((unreadable / ledger.rows.length) * 100)}%입니다(>30%) — 근거가 빈약한 단위가 많습니다.`);
  }

  const indexPath = knowledgePath("index.md");
  if (pathExists(indexPath)) {
    let index = readText(indexPath);
    index = setFrontmatterField(index, "lph-knowledge", "1");
    index = setFrontmatterField(index, "knowledge_schema", "1");
    index = setFrontmatterField(index, "bootstrap", "complete");
    writeText(indexPath, index);
  } else {
    writeText(indexPath, templateText("index.md").replace("bootstrap: not-needed", "bootstrap: complete"));
  }
  if (!pathExists(knowledgePath("_tombstones.md"))) writeText(knowledgePath("_tombstones.md"), templateText("tombstones.md"));
  writeText(ledger.ledgerPath, setFrontmatterField(ledger.content, "status", "complete"));

  console.log(`[bootstrap finalize] 완료 — 단위 ${ledger.rows.length} · ${[...counts].map(([verdict, count]) => `${verdict} ${count}`).join(" · ")}`);
  console.log(`활성 항목 ${loadCatalog().entries.length}건 · 마커 docs/knowledge/index.md 생성`);
}

function cmdBootstrap(cli) {
  const sub = cli.positional[1];
  if (sub === "plan") return cmdBootstrapPlan(cli);
  if (sub === "next-batch") return cmdBootstrapNextBatch(cli);
  if (sub === "mark") return cmdBootstrapMark(cli);
  if (sub === "status") return cmdBootstrapStatus();
  if (sub === "finalize") return cmdBootstrapFinalize();
  return die("bootstrap 하위 명령: plan | next-batch | mark | status | finalize");
}

const COMMANDS = {
  brief: cmdBrief,
  show: cmdShow,
  refs: cmdRefs,
  scaffold: cmdScaffold,
  retire: cmdRetire,
  reanchor: cmdReanchor,
  record: cmdRecord,
  pending: cmdPending,
  seed: cmdSeed,
  status: cmdStatus,
  check: cmdCheck,
  bootstrap: cmdBootstrap,
};

const cli = parseCli(process.argv.slice(2));
const handler = COMMANDS[cli.positional[0]];
if (!handler) die(`명령: ${Object.keys(COMMANDS).join(" | ")}`);
handler(cli);

