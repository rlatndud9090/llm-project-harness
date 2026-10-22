// 지식 계층(docs/knowledge) 공용 로직. 게이트(K1–K11)와 조회·상태 헬퍼를 한 곳에 두어
// artifact-check(게이트 실행)와 knowledge.mjs(CLI)·doctor/session-start가 같은 구현을 쓴다.
// 구조(ID·메타·출처·앵커·묘비)는 기계가 강제하고, 무엇이 지식인지는 모델 몫이다 — 항목 내용의
// 존재를 강제하는 체크박스형 게이트는 두지 않는다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  BASE_BRANCHES,
  REPO_ROOT,
  artifactIsFinal,
  bodyAfterFrontmatter,
  findWikiAuthoringSentinel,
  getWorkBranch,
  gitShow,
  harnessPath,
  isGitRepo,
  listMarkdownFiles,
  parseFrontmatter,
  parseKnowledgeEvents,
  parseWorkBranch,
  pathExists,
  readText,
  readUnitAreas,
  repoPath,
  sectionFileName,
  toPosix,
  unitDirs,
  unitIsFinal,
} from "./lib.mjs";

export const KNOWLEDGE_DIR = "docs/knowledge";
export const KIND_DIRS = { G: "gotchas", INV: "invariants" };
export const COMMON_AREA = "_common";
export const GOTCHA_TYPES = ["규칙부재", "규칙불충분", "잘못된추론", "외부제약"];
export const TOMBSTONE_STATES = ["통합", "폐기", "대체"];
export const BOOTSTRAP_VERDICTS = ["기여", "무기여", "판정불가", "보류", "→guideline"];
export const MAX_ENTRY_LINES = 12;
export const MAX_AREA_ENTRIES = 25;
export const MAX_FILE_LINES = 300;
export const MAX_SLUG_LENGTH = 32;

export const ID_HEADING_RE = /^### (G|INV)-(\d{6})-([a-z0-9]+(?:-[a-z0-9]+)*): (.+)$/;
export const ID_RE = /^(G|INV)-(\d{6})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const ID_TOKEN_RE = /\b(?:G|INV)-\d{6}-[a-z0-9]+(?:-[a-z0-9]+)*/g;
// INV 출처로 인정되는 raw 산출물 참조(repo-relative). PR/커밋만으로는 출처가 될 수 없다.
export const RAW_SOURCE_RE = /^docs\/raw\/(feature|bugfix|chore)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(prd|adr|bugfix)\.md(?:#(\S+))?$/;
const FILESYSTEM_ARTIFACTS = new Set(["desktop.ini", "thumbs.db", "ehthumbs.db"]);
// 게이트는 CI·터미널·git 훅에서도 돌므로 `${CLAUDE_PLUGIN_ROOT}` 리터럴 대신 실제 경로를 박는다.
const REANCHOR_HINT = `node "${harnessPath("scripts", "harness", "knowledge.mjs")}" reanchor`;

// scaffold가 찍는 골격 토큰. 게이트(K3)는 이 토큰이 그대로 남았을 때만 막는다 — 본문에 쓴 일반
// `{…}` 서술은 골격이 아니다. scaffold(knowledge.mjs)도 같은 상수로 골격을 만들어 둘이 어긋나지 않는다.
export const SKELETON = {
  title: "{명령형 규칙 한 문장}",
  gotchaType: "{규칙부재|규칙불충분|잘못된추론|외부제약}",
  source: "{출처}",
  code: "{코드}",
  rule: "{해야 할 것 / 하면 안 되는 것}",
  why: "{실제로 생긴 일}",
  invSource: "{docs/raw/<type>/<slug>/adr.md#결정-N}",
  seal: "{테스트 경로 또는 없음}",
  violation: "{무엇이 깨지는가}",
};
export const SKELETON_TOKENS = Object.values(SKELETON);

// ─── 경로·git 헬퍼 ───────────────────────────────────────────────────────────
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function knowledgePath(...parts) {
  return repoPath("docs", "knowledge", ...parts);
}

function rel(filePath) {
  return toPosix(path.relative(REPO_ROOT, filePath));
}

// ─── 마커·부트스트랩 상태 ────────────────────────────────────────────────────
export function hasKnowledgeMarker() {
  const indexPath = knowledgePath("index.md");
  if (!pathExists(indexPath)) return false;
  return parseFrontmatter(readText(indexPath))?.["lph-knowledge"] === "1";
}

// 부트스트랩 원장 frontmatter(없으면 null). session-start가 부르는 O(1) 확인용이기도 하다.
export function readBootstrapFrontmatter() {
  const ledgerPath = knowledgePath("bootstrap.md");
  if (!pathExists(ledgerPath)) return null;
  return parseFrontmatter(readText(ledgerPath)) ?? {};
}

export function bootstrapInProgress() {
  return readBootstrapFrontmatter()?.status === "in-progress";
}

// 원장 표 `| unit | area | date | 판정 | IDs | 비고 |`를 행 단위로 읽는다. line은 0-based
// 파일 줄 번호라 mark가 그 줄만 바꿔 쓸 수 있다.
export function parseBootstrapLedger(content) {
  const lines = content.split("\n");
  const rows = [];
  lines.forEach((line, index) => {
    if (!line.startsWith("|")) return;
    const cells = splitTableRow(line);
    if (cells.length < 6 || cells[0] === "unit" || /^:?-+:?$/.test(cells[0])) return;
    rows.push({
      line: index,
      unit: cells[0],
      area: cells[1],
      date: cells[2],
      verdict: cells[3],
      ids: cells[4] === "-" ? [] : cells[4].split(",").map((id) => id.trim()).filter(Boolean),
      note: cells[5] === "-" ? "" : cells[5],
    });
  });
  return { lines, rows };
}

export function readBootstrapRows() {
  const ledgerPath = knowledgePath("bootstrap.md");
  if (!pathExists(ledgerPath)) return [];
  return parseBootstrapLedger(readText(ledgerPath)).rows;
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

// ─── 항목 파싱 ───────────────────────────────────────────────────────────────
export function isValidYymmdd(six) {
  const yy = Number(six.slice(0, 2));
  const mm = Number(six.slice(2, 4));
  const dd = Number(six.slice(4, 6));
  return isValidDate(2000 + yy, mm, dd);
}

export function isValidDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return Boolean(match) && isValidDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function idDate(id) {
  const match = ID_RE.exec(id);
  if (!match) return "";
  return `20${match[2].slice(0, 2)}-${match[2].slice(2, 4)}-${match[2].slice(4, 6)}`;
}

// 코드펜스(``` 또는 ~~~) 상태 추적기. 줄을 넣으면 "펜스 안이거나 펜스 구분줄"인지 돌려준다.
// 여는 기호와 같은 종류·같거나 더 긴 기호로만 닫힌다(CommonMark). 모든 파서가 이 하나를 쓴다.
function makeFenceTracker() {
  let open = null;
  return (line) => {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (open) {
      if (match && match[1][0] === open[0] && match[1].length >= open.length) open = null;
      return true;
    }
    if (match) {
      open = match[1];
      return true;
    }
    return false;
  };
}

function stripFences(text) {
  const inFence = makeFenceTracker();
  return text
    .split("\n")
    .filter((line) => !inFence(line))
    .join("\n");
}

function stripCode(text) {
  return stripFences(text).replace(/`[^`\n]*`/g, "");
}

// 한 지식 파일을 항목들로 쪼갠다. 코드펜스 안의 `###`는 헤딩이 아니다. 항목 끝은 다음
// `### `/`## `/`# ` 또는 EOF. invalidHeadings는 `### `인데 ID 정규식에 안 맞는 줄(K2).
export function parseKnowledgeFile(content, kind) {
  const lines = content.split("\n");
  const entries = [];
  const invalidHeadings = [];
  let current = null;
  const inFence = makeFenceTracker();

  const close = (endIndex) => {
    if (!current) return;
    let last = endIndex;
    while (last > current.startIndex && lines[last - 1].trim() === "") last -= 1;
    current.lines = lines.slice(current.startIndex, last);
    current.startLine = current.startIndex + 1;
    finalizeEntry(current);
    entries.push(current);
    current = null;
  };

  lines.forEach((line, index) => {
    if (inFence(line)) return;
    if (/^#{1,3}\s/.test(line)) {
      close(index);
      if (/^###\s/.test(line)) {
        const match = ID_HEADING_RE.exec(line);
        if (match) {
          current = {
            kind: match[1],
            id: `${match[1]}-${match[2]}-${match[3]}`,
            date6: match[2],
            slug: match[3],
            rawTitle: match[4],
            startIndex: index,
          };
        } else {
          invalidHeadings.push({ line: index + 1, text: line.trim() });
        }
      }
    }
  });
  close(lines.length);
  return { entries, invalidHeadings, lineCount: content.replace(/\n+$/, "").split("\n").length, kindOfFile: kind };
}

function finalizeEntry(entry) {
  entry.unconfirmed = / \(미확인\)$/.test(entry.rawTitle);
  entry.title = entry.rawTitle.replace(/ \(미확인\)$/, "");
  entry.text = entry.lines.join("\n");
  entry.meta = null;
  for (let i = 1; i < entry.lines.length; i += 1) {
    if (entry.lines[i].trim() === "") continue;
    if (entry.lines[i].startsWith("> ")) entry.meta = parseMetaLine(entry.lines[i]);
    entry.bodyStart = i + 1;
    break;
  }
  entry.areas = entry.meta?.area ? splitList(entry.meta.area) : [];
}

function parseMetaLine(line) {
  const meta = {};
  for (const part of line.slice(2).split(" · ")) {
    const match = /^([^:]+):\s*(.*)$/.exec(part.trim());
    if (match) meta[match[1].trim()] = match[2].trim();
  }
  return meta;
}

function splitList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// 코드/봉인 앵커 값을 { none, items:[{path, symbol}] }로 푼다. `없음(사유)` = none. 백틱 토큰이
// 하나도 없고 none도 아니면 items가 비어 호출자가 형식 오류로 본다.
export function parseAnchors(value) {
  const text = (value ?? "").trim();
  if (/^없음/.test(text)) return { none: true, items: [], raw: text };
  const items = [...text.matchAll(/`([^`]+)`/g)].map((match) => {
    const token = match[1].trim();
    const colon = token.indexOf(":");
    return colon === -1
      ? { path: token, symbol: null, token }
      : { path: token.slice(0, colon), symbol: token.slice(colon + 1), token };
  });
  return { none: false, items, raw: text };
}

export function parseSources(value) {
  return splitList(value ?? "").map((token) => {
    const bare = token.replace(/^`|`$/g, "");
    const match = RAW_SOURCE_RE.exec(bare);
    return match
      ? { token: bare, raw: true, type: match[1], slug: match[2], file: match[3], fragment: match[4] ?? null }
      : { token: bare, raw: false };
  });
}

// ─── fragment 문법 ───────────────────────────────────────────────────────────
// `#결정-N` : `### 결정 N` 헤딩. `#d-N` : 레거시 ADR `## 결정` 섹션의 N번째 최상위 항목.
// 그 밖 : 본문 헤딩 slug(소문자·구두점 제거·공백→`-`). 앞의 둘이 실패해도 slug 일치를 허용한다.
export function slugifyHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function headingsOf(body) {
  const headings = [];
  for (const line of body.split("\n")) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) headings.push(match[1]);
  }
  return headings;
}

export function fragmentExists(content, fragment) {
  let decoded = fragment;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    // 디코딩 불가면 원문 그대로 비교한다.
  }
  // 펜스 안의 예시 헤딩·목록이 실재 결정으로 세어지지 않도록 세 판정 모두 펜스를 걷어낸 본문을 본다.
  const body = stripFences(bodyAfterFrontmatter(content));

  const decision = /^결정-(\d+)$/.exec(decoded);
  if (decision && new RegExp(`^###\\s+결정\\s+${decision[1]}(?:[.:)\\s]|$)`, "m").test(body)) return true;

  const legacy = /^d-(\d+)$/.exec(decoded);
  if (legacy) {
    const lines = body.split("\n");
    const start = lines.findIndex((line) => /^##\s+결정\s*$/.test(line));
    if (start !== -1) {
      let count = 0;
      for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i += 1) {
        if (/^(?:-\s|\d+\.\s)/.test(lines[i])) count += 1;
      }
      if (count >= Number(legacy[1])) return true;
    }
  }

  const wanted = decoded.toLowerCase();
  return headingsOf(body).some((heading) => slugifyHeading(heading) === wanted);
}

// ─── 묘비 ────────────────────────────────────────────────────────────────────
export function parseTombstones(content) {
  const rows = [];
  const badRows = [];
  let hasHeader = false;
  content.split("\n").forEach((line, index) => {
    if (!line.startsWith("|")) return;
    const cells = splitTableRow(line);
    if (cells[0]?.toLowerCase() === "id") {
      hasHeader = cells.length >= 4 && cells[1] === "상태";
      return;
    }
    if (/^:?-+:?$/.test(cells[0] ?? "")) return;
    if (cells.length < 4) {
      badRows.push({ line: index + 1, text: line.trim() });
      return;
    }
    rows.push({
      line: index + 1,
      id: cells[0],
      state: cells[1],
      to: ["", "-", "—"].includes(cells[2]) ? null : cells[2],
      reason: cells.slice(3).join(" | "),
    });
  });
  return { rows, badRows, hasHeader };
}

// ─── 카탈로그 ────────────────────────────────────────────────────────────────
export function loadCatalog() {
  const files = [];
  const strays = [];
  for (const [kind, dirName] of Object.entries(KIND_DIRS)) {
    const dir = knowledgePath(dirName);
    if (!pathExists(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || FILESYSTEM_ARTIFACTS.has(entry.name.toLowerCase())) continue;
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        strays.push(`${KNOWLEDGE_DIR}/${dirName}/${entry.name}`);
        continue;
      }
      const filePath = path.join(dir, entry.name);
      const content = readText(filePath);
      const parsed = parseKnowledgeFile(content, kind);
      const frontmatter = parseFrontmatter(content) ?? null;
      const area = frontmatter?.area?.trim() || null;
      const file = { kind, dirName, name: entry.name, path: filePath, rel: rel(filePath), content, frontmatter, area, ...parsed };
      for (const item of file.entries) {
        item.file = file.rel;
        item.fileArea = area;
      }
      files.push(file);
    }
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  const entries = files.flatMap((file) => file.entries);
  const tombPath = knowledgePath("_tombstones.md");
  const tombstones = pathExists(tombPath)
    ? { exists: true, ...parseTombstones(readText(tombPath)) }
    : { exists: false, rows: [], badRows: [], hasHeader: false };
  return {
    files,
    strays,
    entries,
    tombstones,
    byId: new Map(entries.map((item) => [item.id, item])),
    tombById: new Map(tombstones.rows.map((row) => [row.id, row])),
  };
}

export function declaredAreas() {
  const areas = new Set();
  for (const type of ["feature", "bugfix"]) {
    for (const dir of unitDirs(type)) {
      for (const area of readUnitAreas(dir, type)) areas.add(area);
    }
  }
  return areas;
}

// 앵커 경로 존재 확인기. git이면 ls-files(추적+미추적-비무시)와 워킹트리 둘 다 맞아야 존재로
// 본다(추적됐지만 지워진 파일, 대소문자 다른 경로를 걸러낸다). git이 없으면 파일시스템.
export function makeFileIndex() {
  const listed = isGitRepo() ? git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]) : null;
  const files = listed === null ? null : new Set(listed.split("\0").filter(Boolean));
  const dirs = new Set();
  if (files) {
    for (const file of files) {
      let dir = path.posix.dirname(file);
      while (dir !== "." && !dirs.has(dir)) {
        dirs.add(dir);
        dir = path.posix.dirname(dir);
      }
    }
  }
  return {
    has(target) {
      const clean = target.replace(/^\.\//, "").replace(/\/+$/, "");
      if (!clean) return false;
      if (!files) return fs.existsSync(repoPath(clean));
      if (files.has(clean)) return fs.existsSync(repoPath(clean));
      return dirs.has(clean);
    },
  };
}

// ─── 게이트 ──────────────────────────────────────────────────────────────────
// 반환: { errors, warnings } — 각 메시지는 `[Kn]`으로 시작한다. assumeMarker는 부트스트랩
// finalize가 마커를 만들기 전에 K1–K8,K10을 미리 돌릴 때 쓰고, branchGates=false는 K9/K11을
// 건너뛴다(finalize는 브랜치와 무관하게 판정).
export function runKnowledgeGates({ assumeMarker = false, branchGates = true } = {}) {
  const errors = [];
  const warnings = [];
  const err = (gate, message) => errors.push(`[${gate}] ${message}`);
  const warn = (gate, message) => warnings.push(`[${gate}] ${message}`);

  if (branchGates) checkBootstrapBranch(err);

  const markerActive = assumeMarker || hasKnowledgeMarker();
  if (!markerActive) return { errors, warnings };

  const catalog = loadCatalog();
  const areas = declaredAreas();
  checkShape(catalog, areas, err, assumeMarker);
  checkIds(catalog, err);
  const fileIndex = makeFileIndex();
  const supersedes = collectSupersedes();
  for (const item of catalog.entries) {
    checkEntry(item, catalog, fileIndex, supersedes, err, warn);
  }
  for (const file of catalog.files) {
    const lineCount = file.content.replace(/\n+$/, "").split("\n").length;
    if (lineCount > MAX_FILE_LINES) warn("K3", `${file.rel}: 파일이 ${lineCount}줄입니다(권장 ≤${MAX_FILE_LINES}) — 정리·통합을 검토하세요.`);
    if (file.entries.length > MAX_AREA_ENTRIES) {
      warn("K3", `${file.rel}: 활성 항목이 ${file.entries.length}개입니다(권장 ≤${MAX_AREA_ENTRIES}) — 통합·폐기를 검토하세요.`);
    }
  }
  checkTombstones(catalog, err);
  checkNoDeletion(catalog, err);
  checkReferences(catalog, err);
  if (branchGates) checkMissingKnowledgeEvent(warn);
  return { errors, warnings };
}

// K9 (마커 무관): in-progress 부트스트랩은 base 브랜치로 들어올 수 없다. 소비자 CI는 PR 전용이라
// base에서 check가 도는 시점이 없다 — PR 컨텍스트에선 병합 대상(GITHUB_BASE_REF)을 먼저 봐야 머지 게이트가 된다.
function checkBootstrapBranch(err) {
  if (!bootstrapInProgress()) return;
  const target = process.env.GITHUB_BASE_REF?.trim();
  if (target && BASE_BRANCHES.has(target)) {
    err(
      "K9",
      `bootstrap.md가 in-progress인데 병합 대상이 베이스(${target})입니다 — 부트스트랩은 finalize까지 마친 뒤에만 병합하세요.`,
    );
    return;
  }
  const branch = getWorkBranch();
  if (BASE_BRANCHES.has(branch)) {
    err(
      "K9",
      `bootstrap.md가 in-progress인데 현재 브랜치가 베이스(${branch})입니다 — 부트스트랩은 작업 브랜치에서 finalize까지 마친 뒤에만 병합하세요.`,
    );
  }
}

// K1 형태·area 파일 정합.
function checkShape(catalog, areas, err, assumeMarker) {
  const root = knowledgePath();
  if (!pathExists(root)) return;
  const allowed = new Set(["index.md", "_tombstones.md", "bootstrap.md", "gotchas", "invariants"]);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || FILESYSTEM_ARTIFACTS.has(entry.name.toLowerCase())) continue;
    if (!allowed.has(entry.name)) {
      err("K1", `${KNOWLEDGE_DIR}에는 index.md, _tombstones.md, bootstrap.md, gotchas/, invariants/ 만 둘 수 있습니다: ${entry.name}`);
    } else if (["gotchas", "invariants"].includes(entry.name) && !entry.isDirectory()) {
      err("K1", `${KNOWLEDGE_DIR}/${entry.name}는 디렉터리여야 합니다.`);
    } else if (entry.name.endsWith(".md") && entry.isDirectory()) {
      err("K1", `${KNOWLEDGE_DIR}/${entry.name}는 파일이어야 합니다.`);
    }
  }
  for (const stray of catalog.strays) {
    err("K1", `${stray}: gotchas/·invariants/ 아래에는 .md 파일만 둘 수 있습니다(하위 디렉터리 금지).`);
  }

  if (!assumeMarker) {
    const bootstrap = parseFrontmatter(readText(knowledgePath("index.md")))?.bootstrap;
    if (bootstrap && !["not-needed", "complete"].includes(bootstrap)) {
      err("K1", `index.md bootstrap 값은 not-needed | complete 여야 합니다: ${bootstrap}`);
    }
  }

  for (const file of catalog.files) {
    if (!file.area) {
      err("K1", `${file.rel}: frontmatter에 area가 필요합니다(공통은 area: ${COMMON_AREA}).`);
    } else if (file.area.includes(",")) {
      err("K1", `${file.rel}: 파일의 area는 하나여야 합니다: ${file.area}`);
    } else {
      const expected = sectionFileName(file.area);
      if (!expected || expected !== file.name) {
        err("K1", `${file.rel}: 파일명이 area와 맞지 않습니다(기대: ${expected ?? "(변환 불가)"}).`);
      }
      if (file.area !== COMMON_AREA && !areas.has(file.area)) {
        err("K1", `${file.rel}: area "${file.area}"는 어떤 raw 단위(prd/bugfix frontmatter)도 선언하지 않은 영역입니다.`);
      }
    }
  }

  const sentinelTargets = [...catalog.files.map((file) => [file.rel, file.content])];
  for (const name of ["index.md", "_tombstones.md", "bootstrap.md"]) {
    if (pathExists(knowledgePath(name))) sentinelTargets.push([`${KNOWLEDGE_DIR}/${name}`, readText(knowledgePath(name))]);
  }
  for (const [file, content] of sentinelTargets) {
    const sentinel = findWikiAuthoringSentinel(content);
    if (sentinel) err("K1", `${file}: 위키 작성 규칙 안내문("${sentinel}")이 섞여 있습니다. 지식 파일에는 항목만 둡니다.`);
  }
}

// K2 ID 형식·접두·전역 유일성.
function checkIds(catalog, err) {
  const seen = new Map();
  for (const file of catalog.files) {
    for (const bad of file.invalidHeadings) {
      err("K2", `${file.rel}:${bad.line}: 항목 헤딩이 형식(### G|INV-YYMMDD-slug: 제목)에 맞지 않습니다: ${bad.text}`);
    }
    for (const item of file.entries) {
      if (!isValidYymmdd(item.date6)) err("K2", `${item.id}: ID 날짜 ${item.date6}가 유효한 YYMMDD가 아닙니다 (${file.rel}).`);
      if (item.slug.length > MAX_SLUG_LENGTH) err("K2", `${item.id}: slug가 ${MAX_SLUG_LENGTH}자를 넘습니다 (${file.rel}).`);
      if (item.kind !== file.kind) {
        err("K2", `${item.id}: ${file.dirName}/ 파일에는 ${file.kind}- 접두 항목만 둘 수 있습니다 (${file.rel}).`);
      }
      if (seen.has(item.id)) err("K2", `${item.id}: ID가 중복입니다 (${seen.get(item.id)} / ${file.rel}).`);
      else seen.set(item.id, file.rel);
    }
  }
  const tombSeen = new Set();
  for (const row of catalog.tombstones.rows) {
    if (tombSeen.has(row.id)) err("K2", `${row.id}: 묘비 ID가 중복입니다.`);
    tombSeen.add(row.id);
  }
}

// K3(메타) · K4(출처) · K5(대체) · K6(앵커)를 항목 단위로 본다.
function checkEntry(item, catalog, fileIndex, supersedes, err, warn) {
  const where = `${item.id} (${item.file})`;
  const prose = stripCode(item.text);
  for (const token of SKELETON_TOKENS) {
    if (prose.includes(token)) err("K3", `${where}: 채우지 않은 골격 토큰 ${token}이(가) 남아 있습니다.`);
  }
  if (item.lines.length > MAX_ENTRY_LINES) warn("K3", `${where}: 항목이 ${item.lines.length}줄입니다(권장 ≤${MAX_ENTRY_LINES}) — 한 규칙만 짧게 남기세요.`);

  const meta = item.meta;
  if (!meta) {
    err("K3", `${where}: 헤딩 다음 줄이 메타(> 키: 값 · …)가 아닙니다.`);
    return;
  }
  const required = item.kind === "G" ? ["발견", "유형", "area", "출처", "코드"] : ["area", "출처", "코드", "봉인"];
  const missing = required.filter((key) => !meta[key]);
  if (missing.length > 0) {
    err("K3", `${where}: 메타 필드가 없습니다: ${missing.join(", ")}`);
    return;
  }
  let metaOk = true;
  const metaError = (message) => {
    metaOk = false;
    err("K3", `${where}: ${message}`);
  };
  if (item.kind === "G") {
    if (!isValidIsoDate(meta["발견"])) metaError(`발견은 YYYY-MM-DD여야 합니다: ${meta["발견"]}`);
    if (!GOTCHA_TYPES.includes(meta["유형"])) metaError(`유형은 ${GOTCHA_TYPES.join("|")} 중 하나여야 합니다: ${meta["유형"]}`);
  }
  if (item.fileArea && item.areas[0] !== item.fileArea) {
    metaError(`첫 area("${item.areas[0]}")가 파일 area("${item.fileArea}")와 다릅니다.`);
  }
  const code = parseAnchors(meta["코드"]);
  if (code.none ? !/^없음\(.+\)$/.test(code.raw) : code.items.length === 0) {
    metaError("코드는 백틱 경로(`path` 또는 `path:symbol`) 또는 `없음(사유)`여야 합니다.");
  }
  const seal = item.kind === "INV" ? parseAnchors(meta["봉인"]) : null;
  if (seal && !seal.none && seal.items.length === 0) metaError("봉인은 백틱 테스트 경로 또는 `없음`이어야 합니다.");
  if (seal?.none && seal.raw !== "없음") metaError("봉인 `없음`에는 사유를 붙이지 않습니다.");

  const sources = parseSources(meta["출처"]);
  if (item.kind === "INV" && !sources.some((source) => source.raw)) {
    metaError("출처에 docs/raw/<type>/<slug>/(prd|adr|bugfix).md[#fragment] 를 최소 1개 포함해야 합니다(PR/커밋만으로는 불변식 출처가 될 수 없음).");
  }
  if (!metaOk) return;

  if (item.kind === "INV") checkSources(item, sources, supersedes, where, err, warn);

  for (const anchor of code.items) {
    if (!fileIndex.has(anchor.path)) {
      err("K6", `${where}: 코드 앵커 경로가 없습니다: ${anchor.path} — ${REANCHOR_HINT} 로 이동 이력을 찾으세요.`);
    }
  }
  for (const anchor of seal?.items ?? []) {
    if (!fileIndex.has(anchor.path)) {
      warn("K6", `${where}: 봉인 경로가 없습니다: ${anchor.path} — ${REANCHOR_HINT} 로 이동 이력을 찾으세요.`);
    }
  }
}

// K4 출처 실재·fragment·final, K5 대체 재판정.
function checkSources(item, sources, supersedes, where, err, warn) {
  const adrStates = [];
  for (const source of sources.filter((entry) => entry.raw)) {
    const filePath = repoPath(source.token.replace(/#.*$/, ""));
    if (!pathExists(filePath)) {
      err("K4", `${where}: 출처 파일이 없습니다: ${source.token}`);
      continue;
    }
    const content = readText(filePath);
    const baseName = `${source.file}.md`;
    if (source.fragment && !fragmentExists(content, source.fragment)) {
      err("K4", `${where}: 출처 fragment가 실재하지 않습니다: ${source.token}`);
    }
    const status = parseFrontmatter(content)?.status;
    if (!artifactIsFinal(baseName, status)) {
      err("K4", `${where}: 출처 ${source.token}가 아직 final이 아닙니다(status ${status ?? "?"}) — 작성 중 단위는 출처가 될 수 없습니다.`);
      continue;
    }
    if (source.file === "adr") adrStates.push({ source, status });
  }

  if (adrStates.length === 0) return;
  const verdicts = adrStates.map(({ source, status }) => {
    const bare = source.token.replace(/#.*$/, "");
    if (status === "superseded" || status === "deprecated") return "dead";
    const hits = supersedes.get(bare) ?? [];
    if (source.fragment && hits.some((hit) => hit.fragment === source.fragment)) return "dead";
    if (hits.some((hit) => !hit.fragment)) return "warn";
    return "live";
  });
  if (verdicts.every((verdict) => verdict === "dead")) {
    err("K5", `${where}: 출처 ADR이 모두 대체·폐기됐습니다 — 재판정 필요: 새 ADR을 출처에 추가하거나 retire 하세요.`);
  } else if (verdicts.includes("warn")) {
    warn("K5", `${where}: 출처 ADR 전체가 다른 ADR의 supersedes 대상입니다 — 불변식이 아직 유효한지 재판정하세요.`);
  }
}

// 모든 feature ADR의 supersedes를 { 대상 ADR 경로 → [{ fragment, by }] }로 모은다.
function collectSupersedes() {
  const map = new Map();
  for (const dir of unitDirs("feature")) {
    const adrPath = path.join(dir, "adr.md");
    if (!pathExists(adrPath)) continue;
    const value = parseFrontmatter(readText(adrPath))?.supersedes;
    if (!value) continue;
    const hashIndex = value.indexOf("#");
    const target = hashIndex === -1 ? value : value.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? null : value.slice(hashIndex + 1);
    const resolved = rel(path.resolve(dir, target));
    if (!map.has(resolved)) map.set(resolved, []);
    map.get(resolved).push({ fragment, by: rel(adrPath) });
  }
  return map;
}

// K7 묘비 표·상태·대체 사슬.
function checkTombstones(catalog, err) {
  const { tombstones, byId, tombById } = catalog;
  if (!tombstones.exists) return;
  if (!tombstones.hasHeader) err("K7", `${KNOWLEDGE_DIR}/_tombstones.md: 표 헤더(| ID | 상태 | 대체 | 사유 |)가 없습니다.`);
  for (const bad of tombstones.badRows) err("K7", `_tombstones.md:${bad.line}: 표 행 형식이 아닙니다: ${bad.text}`);
  for (const row of tombstones.rows) {
    if (!ID_RE.test(row.id)) {
      err("K7", `_tombstones.md:${row.line}: 묘비 ID 형식이 아닙니다: ${row.id}`);
      continue;
    }
    if (!TOMBSTONE_STATES.includes(row.state)) {
      err("K7", `${row.id}: 상태는 ${TOMBSTONE_STATES.join("|")} 중 하나여야 합니다: ${row.state}`);
      continue;
    }
    if (byId.has(row.id)) err("K7", `${row.id}: 활성 항목인데 묘비에도 있습니다.`);
    if (row.state !== "폐기" && !row.to) err("K7", `${row.id}: ${row.state}은(는) 대체 ID가 필요합니다.`);
  }
  for (const row of tombstones.rows) {
    if (!TOMBSTONE_STATES.includes(row.state) || row.state === "폐기" || !row.to) continue;
    const visited = new Set([row.id]);
    let next = row.to;
    for (;;) {
      if (visited.has(next)) {
        err("K7", `${row.id}: 대체 사슬이 순환합니다.`);
        break;
      }
      visited.add(next);
      if (byId.has(next)) break;
      const hop = tombById.get(next);
      if (!hop) {
        err("K7", `${row.id}: 대체 사슬이 존재하지 않는 ID(${next})로 끝납니다.`);
        break;
      }
      if (hop.state === "폐기") break;
      if (!hop.to) {
        err("K7", `${row.id}: 대체 사슬이 대체 ID 없이 끊깁니다(${next}).`);
        break;
      }
      next = hop.to;
    }
  }
}

// 기준 ref에서 지식 파일 하나가 가졌던 ID들. 현재 카탈로그와 같은 파서로 읽어 펜스 안 예시 등으로
// 비대칭이 생기지 않게 한다.
function idsInKnowledgeFile(file, content) {
  if (file === `${KNOWLEDGE_DIR}/_tombstones.md`) return parseTombstones(content).rows.map((row) => row.id);
  const kind = file.startsWith(`${KNOWLEDGE_DIR}/gotchas/`) ? "G" : file.startsWith(`${KNOWLEDGE_DIR}/invariants/`) ? "INV" : null;
  return kind ? parseKnowledgeFile(content, kind).entries.map((entry) => entry.id) : [];
}

// K8의 비교 기준 ref. PR CI의 HEAD는 PR 변경이 이미 들어간 머지 커밋이라 HEAD와 비교하면 아무것도
// 못 잡는다 — PR 컨텍스트에선 병합 대상(base 팁)을 기준으로 삼는다. 구할 수 없으면 null(fail-open).
function deletionBaseRef() {
  const target = process.env.GITHUB_BASE_REF?.trim();
  if (!target) return "HEAD";
  const base = git(["merge-base", "HEAD", `origin/${target}`])?.trim();
  if (base) return base;
  // 머지 커밋 체크아웃이면 첫 부모가 base 팁이다.
  if (git(["rev-parse", "--verify", "--quiet", "HEAD^2"]) === null) return null;
  return git(["rev-parse", "--verify", "--quiet", "HEAD^1"])?.trim() || null;
}

// K8 삭제 금지: 기준 ref에 있던 ID는 활성/묘비 어디엔가 남아야 한다.
function checkNoDeletion(catalog, err) {
  if (!isGitRepo()) return;
  const ref = deletionBaseRef();
  if (!ref) return;
  const listed = git(["ls-tree", "-r", "-z", "--name-only", ref, "--", KNOWLEDGE_DIR]);
  if (!listed) return;
  const current = new Set([...catalog.byId.keys(), ...catalog.tombById.keys()]);
  for (const file of listed.split("\0").filter((name) => name.endsWith(".md"))) {
    const previous = gitShow(file, ref);
    if (!previous) continue;
    for (const id of idsInKnowledgeFile(file, previous)) {
      if (!current.has(id)) err("K8", `${id}: ${ref === "HEAD" ? "HEAD" : "병합 기준"}(${file})에 있던 ID가 사라졌습니다 — 지우지 말고 retire 하세요.`);
    }
  }
}

// K10 참조: AGENTS.md·docs/**/*.md 안의 ID 토큰은 활성 또는 묘비에 있어야 한다.
function checkReferences(catalog, err) {
  const known = new Set([...catalog.byId.keys(), ...catalog.tombById.keys()]);
  const files = [...listMarkdownFiles(repoPath("docs"))];
  if (pathExists(repoPath("AGENTS.md"))) files.push(repoPath("AGENTS.md"));
  for (const filePath of files) {
    const text = stripFences(readText(filePath));
    const unknown = new Set((text.match(ID_TOKEN_RE) ?? []).filter((id) => !known.has(id)));
    for (const id of unknown) err("K10", `${rel(filePath)}: 존재하지 않는 지식 ID를 참조합니다: ${id}`);
  }
}

// K11 (warning): 현재 작업 브랜치 단위가 final인데 KNOWLEDGE 기록이 없다.
function checkMissingKnowledgeEvent(warn) {
  const parsed = parseWorkBranch(getWorkBranch());
  if (!parsed || parsed.invalid) return;
  const dir = repoPath("docs", "raw", parsed.type, parsed.slug);
  if (!pathExists(dir) || !unitIsFinal(dir, parsed.type)) return;
  const statePath = path.join(dir, "state.md");
  if (!pathExists(statePath) || parseKnowledgeEvents(readText(statePath)).length > 0) return;
  warn("K11", `${rel(dir)}는 final인데 KNOWLEDGE 기록이 없습니다 — make-pr 단계에서 knowledge-distill --unit ${rel(dir)} 를 실행하세요.`);
}

// ─── state.md KNOWLEDGE 이벤트 기록 ──────────────────────────────────────────
// `## 지식 기록` 섹션 끝에 줄을 붙인다(섹션이 없으면 파일 끝에 만든다). 같은 줄이 이미 있으면
// 그대로 돌려줘 재시도·재개가 원장을 부풀리지 않는다(호출자는 반환값 === 입력으로 판별).
export function appendKnowledgeEvent(content, line) {
  if (content.split("\n").some((existing) => existing.trim() === line.trim())) return content;
  const heading = /^## 지식 기록[^\n]*$/m.exec(content);
  if (!heading) return `${content.trimEnd()}\n\n## 지식 기록\n\n${line}\n`;
  const lineEnd = content.indexOf("\n", heading.index);
  const afterHeading = lineEnd === -1 ? content.length : lineEnd;
  const next = content.indexOf("\n## ", afterHeading);
  const insertAt = next === -1 ? content.length : next;
  const before = content.slice(0, insertAt).trimEnd();
  const rest = content.slice(insertAt);
  return `${before}\n${line}${rest ? `\n${rest}` : "\n"}`;
}

// ─── 상태 ────────────────────────────────────────────────────────────────────
// final 단위 목록 [{ type, slug, rel, dir }] (워킹트리 기준).
export function listFinalUnits() {
  const units = [];
  for (const type of ["feature", "bugfix"]) {
    for (const dir of unitDirs(type)) {
      if (unitIsFinal(dir, type)) units.push({ type, slug: path.basename(dir), rel: rel(dir), dir });
    }
  }
  return units.sort((a, b) => a.rel.localeCompare(b.rel));
}

// 기록 대기 단위: final인데 KNOWLEDGE 이벤트가 없고 부트스트랩 원장에도 없다.
export function listPendingUnits() {
  const ledger = new Set(readBootstrapRows().map((row) => row.unit));
  return listFinalUnits().filter((unit) => {
    if (ledger.has(unit.rel)) return false;
    const statePath = path.join(unit.dir, "state.md");
    return !(pathExists(statePath) && parseKnowledgeEvents(readText(statePath)).length > 0);
  });
}

// docs 아래 다른 형식의 gotchas 파일(docs/knowledge 제외) — 부트스트랩 시드 소스 후보.
export function findLegacyGotchasFiles() {
  return listMarkdownFiles(repoPath("docs"))
    .map(rel)
    .filter((file) => !file.startsWith(`${KNOWLEDGE_DIR}/`) && /^gotchas/i.test(path.posix.basename(file)))
    .sort();
}

export function knowledgeStatus() {
  const marker = hasKnowledgeMarker();
  const bootstrapFm = readBootstrapFrontmatter();
  const bootstrap = bootstrapFm
    ? bootstrapFm.status === "in-progress"
      ? "in-progress"
      : "complete"
    : marker
      ? (parseFrontmatter(readText(knowledgePath("index.md")))?.bootstrap ?? "not-needed")
      : "none";
  const state = bootstrap === "in-progress" ? "bootstrap-in-progress" : marker ? "active" : "inactive";

  const catalog = loadCatalog();
  const areaCounts = {};
  for (const item of catalog.entries) {
    const area = item.fileArea ?? COMMON_AREA;
    areaCounts[area] ??= { G: 0, INV: 0 };
    areaCounts[area][item.kind] += 1;
  }
  const pendingUnits = marker ? listPendingUnits() : [];
  return {
    state,
    marker,
    bootstrap,
    areaCounts,
    activeCount: catalog.entries.length,
    finalUnitCount: listFinalUnits().length,
    pendingCount: pendingUnits.length,
    pendingUnits: pendingUnits.map((unit) => unit.rel),
    legacyGotchasFiles: marker ? [] : findLegacyGotchasFiles(),
  };
}
