import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  artifactIsFinal,
  formatKnowledgeEvent,
  getWorkBranch,
  parseApprovalEvents,
  parseKnowledgeEvents,
  unitIsFinal,
} from "./lib.mjs";
import {
  SKELETON_TOKENS,
  appendKnowledgeEvent,
  fragmentExists,
  parseAnchors,
  parseBootstrapLedger,
  parseKnowledgeFile,
  parseSources,
  parseTombstones,
  slugifyHeading,
} from "./knowledge-lib.mjs";

// GitHub Actions가 러너에 심는 브랜치 변수(GITHUB_REF_NAME=main 등)가 자식 프로세스로 새면 픽스처의
// git 브랜치 대신 CI 브랜치로 판정된다(getWorkBranch·K9·K11). 테스트는 이 변수를 지운 채 시작하고,
// CI 동작을 보는 테스트만 env 인자로 명시 주입한다.
for (const key of ["GITHUB_HEAD_REF", "GITHUB_REF_NAME", "GITHUB_BASE_REF"]) delete process.env[key];

// 엔진은 이 저장소(플러그인)에만 있고, 테스트는 임시 소비 프로젝트를 cwd로 두고 스크립트를
// 직접 spawn한다 — harness-flows.test.mjs와 같은 방식이다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KNOWLEDGE = path.join(repoRoot, "scripts", "harness", "knowledge.mjs");
const ARTIFACT_CHECK = path.join(repoRoot, "scripts", "harness", "artifact-check.mjs");

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────
function withProject(callback) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llm-knowledge-"));
  try {
    callback(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function git(projectRoot, args) {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function commitAll(projectRoot, message = "snapshot") {
  git(projectRoot, ["add", "-A"]);
  git(projectRoot, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", message]);
}

function harnessInit(projectRoot) {
  execFileSync(process.execPath, [path.join(repoRoot, "scripts", "harness", "init.mjs"), "--no-git-hooks"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  // 신규 스캐폴드 init은 지식 마커를 시드한다 — 이 파일의 시나리오는 미활성 상태에서 출발한다.
  fs.rmSync(path.join(projectRoot, "docs", "knowledge"), { recursive: true, force: true });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function frontmatter(fields) {
  const lines = Object.entries({ date: "2026-01-01", ...fields }).map(([key, value]) => `${key}: ${value}`);
  return ["---", ...lines, "---"].join("\n");
}

function knowledge(projectRoot, args, env = {}) {
  const result = spawnSync(process.execPath, [KNOWLEDGE, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status, out: result.stdout, err: result.stderr, all: `${result.stdout}${result.stderr}` };
}

// 지식 게이트만 보는 진입점(knowledge.mjs check). 다른 하네스 게이트의 오류와 섞이지 않는다.
function check(projectRoot, env = {}) {
  return knowledge(projectRoot, ["check"], env);
}

function gateLines(result, gate) {
  return result.all.split("\n").filter((line) => line.includes(`[${gate}]`));
}

const kpath = (projectRoot, ...parts) => path.join(projectRoot, "docs", "knowledge", ...parts);

function prdFile(fields = {}) {
  return `${frontmatter({
    title: "PRD",
    status: "approved",
    unit_type: "feature",
    approval: "user:2026-01-01:승인",
    area: "결제",
    ...fields,
  })}\n# PRD\n`;
}

function adrFile({ status = "accepted", supersedes = "", body } = {}) {
  return `${frontmatter({
    title: "ADR",
    status,
    approval: "user:2026-01-01:승인",
    unit_type: "feature",
    supersedes,
  })}

# ADR

## 결정

### 결정 1. 재시도는 한 번만 한다

설명.

### 결정 2. 멱등키를 쓴다

설명.
${body ?? ""}`;
}

function bugfixFile(fields = {}) {
  return `${frontmatter({ title: "Bugfix", status: "fixed", unit_type: "bugfix", area: "결제", ...fields })}\n# Bugfix\n`;
}

function stateFile(extra = "") {
  return `---\ntitle: S\ndate: 2026-01-01\nstage: approved\nprd_status: approved\nadr_status: accepted\n---\n\n# 원장\n\n## 단계 로그\n\n- 2026-01-01 kickoff\n${extra}`;
}

const INV_ENTRY = `### INV-261022-pay-retry-once: 결제 재시도는 한 번만 한다
> area: 결제 · 출처: docs/raw/feature/pay-retry/adr.md#결정-1 · 코드: \`src/pay/retry.ts:scheduleRetry\` · 봉인: \`src/pay/retry.test.ts\`

**위반 시:** 중복 결제가 발생한다
`;

const GOTCHA_ENTRY = `### G-261022-retry-idempotency: 재시도 요청에는 멱등키를 붙인다
> 발견: 2026-10-22 · 유형: 규칙부재 · area: 결제 · 출처: docs/raw/bugfix/pay-dup/bugfix.md, PR#123, \`abc1234\` · 코드: \`src/pay/retry.ts\`, \`src/pay/api.ts:submit\`

**규칙:** 멱등키 없이 재시도하지 않는다

**왜:** 중복 결제가 실제로 생겼다
`;

function invFile(...entries) {
  return `---\narea: 결제\n---\n\n# 불변식: 결제\n\n${entries.join("\n")}`;
}

function gotchaFile(...entries) {
  return `---\narea: 결제\n---\n\n# 함정: 결제\n\n${entries.join("\n")}`;
}

// git 저장소 + 시드된 지식 계층 + 결제 영역의 final feature/bugfix 단위 하나씩. main에 커밋돼 있다.
function seededProject(projectRoot, { commit = true } = {}) {
  git(projectRoot, ["init", "-q"]);
  git(projectRoot, ["checkout", "-q", "-b", "main"]);
  harnessInit(projectRoot);
  writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "prd.md"), prdFile());
  writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "adr.md"), adrFile());
  writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "state.md"), stateFile());
  writeFile(path.join(projectRoot, "docs", "raw", "bugfix", "pay-dup", "bugfix.md"), bugfixFile());
  writeFile(path.join(projectRoot, "docs", "raw", "bugfix", "pay-dup", "state.md"), stateFile());
  for (const file of ["retry.ts", "api.ts", "retry.test.ts"]) writeFile(path.join(projectRoot, "src", "pay", file), "export {};\n");
  expect(knowledge(projectRoot, ["seed"]).status).toBe(0);
  if (commit) commitAll(projectRoot, "base");
}

function addKnowledge(projectRoot, { inv = [INV_ENTRY], gotchas = [GOTCHA_ENTRY] } = {}) {
  if (inv.length > 0) writeFile(kpath(projectRoot, "invariants", "결제.md"), invFile(...inv));
  if (gotchas.length > 0) writeFile(kpath(projectRoot, "gotchas", "결제.md"), gotchaFile(...gotchas));
}

// ─── 파서 · lib ─────────────────────────────────────────────────────────────
describe("knowledge parsing", () => {
  it("round-trips entries, meta fields and the (미확인) suffix", () => {
    const content = invFile(INV_ENTRY, GOTCHA_ENTRY.replace("재시도 요청에는 멱등키를 붙인다", "멱등키를 붙인다 (미확인)"));
    const parsed = parseKnowledgeFile(content, "INV");
    expect(parsed.entries.map((entry) => entry.id)).toEqual(["INV-261022-pay-retry-once", "G-261022-retry-idempotency"]);
    const [inv, gotcha] = parsed.entries;
    expect(inv.kind).toBe("INV");
    expect(inv.title).toBe("결제 재시도는 한 번만 한다");
    expect(inv.meta.봉인).toBe("`src/pay/retry.test.ts`");
    expect(inv.areas).toEqual(["결제"]);
    expect(gotcha.unconfirmed).toBe(true);
    expect(gotcha.title).toBe("멱등키를 붙인다");
    expect(gotcha.meta.발견).toBe("2026-10-22");
    expect(parsed.invalidHeadings).toEqual([]);
  });

  it("records malformed ### headings and ignores headings inside code fences", () => {
    const content = "---\narea: 결제\n---\n\n### G-26102-bad: x\n\n```\n### G-261022-fenced: y\n```\n\n### 그냥 제목\n";
    const parsed = parseKnowledgeFile(content, "G");
    expect(parsed.entries).toEqual([]);
    expect(parsed.invalidHeadings.map((item) => item.text)).toEqual(["### G-26102-bad: x", "### 그냥 제목"]);
  });

  it("parses code anchors, symbols and the 없음(사유) form", () => {
    expect(parseAnchors("`src/a.ts`, `src/b.ts:run`").items.map((item) => [item.path, item.symbol])).toEqual([
      ["src/a.ts", null],
      ["src/b.ts", "run"],
    ]);
    expect(parseAnchors("없음(설정 문서만)").none).toBe(true);
    expect(parseAnchors("그냥 글").items).toEqual([]);
  });

  it("classifies sources as raw refs or free text", () => {
    const sources = parseSources("docs/raw/feature/a-b/adr.md#결정-2, PR#123, `abc1234`");
    expect(sources[0]).toMatchObject({ raw: true, type: "feature", slug: "a-b", file: "adr", fragment: "결정-2" });
    expect(sources[1].raw).toBe(false);
    expect(sources[2].token).toBe("abc1234");
  });

  it("resolves #결정-N, legacy #d-N and heading-slug fragments", () => {
    const adr = adrFile();
    expect(fragmentExists(adr, "결정-1")).toBe(true);
    expect(fragmentExists(adr, "결정-2")).toBe(true);
    expect(fragmentExists(adr, "결정-3")).toBe(false);
    const legacy = `${frontmatter({ status: "accepted" })}\n# ADR\n\n## 결정\n\n- 첫째 결정\n- 둘째 결정\n  - 하위\n\n## 선택지\n\n- 가\n`;
    expect(fragmentExists(legacy, "d-1")).toBe(true);
    expect(fragmentExists(legacy, "d-2")).toBe(true);
    expect(fragmentExists(legacy, "d-3")).toBe(false);
    expect(fragmentExists(legacy, "선택지")).toBe(true);
    expect(fragmentExists(legacy, "없는-헤딩")).toBe(false);
    expect(fragmentExists("# Hello, World!\n", "hello-world")).toBe(true);
    expect(slugifyHeading("  Hello, World! 한글 ")).toBe("hello-world-한글");
  });

  it("parses the tombstone table and flags non-table rows", () => {
    const table = "| ID | 상태 | 대체 | 사유 |\n| --- | --- | --- | --- |\n| G-261022-a-b | 통합 | G-261022-c-d | 합침 |\n| G-261022-x-y | 폐기 | - | 사라짐 |\n| 깨진행 |\n";
    const parsed = parseTombstones(table);
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.rows.map((row) => [row.id, row.state, row.to])).toEqual([
      ["G-261022-a-b", "통합", "G-261022-c-d"],
      ["G-261022-x-y", "폐기", null],
    ]);
    expect(parsed.badRows).toHaveLength(1);
  });

  it("parses the bootstrap ledger table with line numbers", () => {
    const parsed = parseBootstrapLedger("---\nstatus: in-progress\n---\n\n| unit | area | date | 판정 | IDs | 비고 |\n| --- | --- | --- | --- | --- | --- |\n| docs/raw/feature/a | 결제 | 2026-01-01 | 기여 | G-261022-a-b,G-261022-c-d | 메모 |\n| docs/raw/chore/b | _common | 2026-01-02 | 대기 | - | - |\n");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ unit: "docs/raw/feature/a", verdict: "기여", ids: ["G-261022-a-b", "G-261022-c-d"], note: "메모" });
    expect(parsed.rows[1].ids).toEqual([]);
    expect(parsed.lines[parsed.rows[1].line]).toContain("docs/raw/chore/b");
  });
});

describe("KNOWLEDGE events", () => {
  it("round-trips ids, none and none(auto)", () => {
    const line = formatKnowledgeEvent({ date: "2026-10-22", invariants: ["INV-261022-a-b", "INV-261022-c-d"], gotchas: [], via: "make-pr" });
    expect(line).toBe("- KNOWLEDGE 2026-10-22 invariants=INV-261022-a-b,INV-261022-c-d gotchas=none via=make-pr");
    expect(parseKnowledgeEvents(line)).toEqual([
      { date: "2026-10-22", invariants: ["INV-261022-a-b", "INV-261022-c-d"], gotchas: [], auto: false, via: "make-pr" },
    ]);
    const auto = formatKnowledgeEvent({ date: "2026-10-22", invariants: "none(auto)", gotchas: "none(auto)", via: "one-shot" });
    expect(parseKnowledgeEvents(auto)[0]).toMatchObject({ auto: true, invariants: [], gotchas: [], via: "one-shot" });
    expect(parseKnowledgeEvents("- KNOWLEDGE 2026-10-22 invariants=x gotchas=none via=nope")).toEqual([]);
  });

  it("is not mistaken for an approval event by the parser or the runtime guard", () => {
    const line = formatKnowledgeEvent({ date: "2026-10-22", invariants: [], gotchas: [], via: "feedback" });
    expect(parseApprovalEvents(line)).toEqual([]);
    withProject((projectRoot) => {
      const statePath = path.join(projectRoot, "docs", "raw", "feature", "x", "state.md");
      writeFile(statePath, stateFile());
      const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "harness", "claude-approval-guard.mjs")], {
        input: JSON.stringify({
          tool_name: "Write",
          tool_input: { file_path: statePath, content: appendKnowledgeEvent(read(statePath), line) },
        }),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
    });
  });

  it("appends under ## 지식 기록 and creates the section when absent", () => {
    const a = formatKnowledgeEvent({ date: "2026-10-22", invariants: [], gotchas: [], via: "make-pr" });
    const b = formatKnowledgeEvent({ date: "2026-10-23", invariants: [], gotchas: [], via: "feedback" });
    const first = appendKnowledgeEvent("# S\n\n## 승인 이벤트\n\n(없음)\n", a);
    expect(first).toContain("## 지식 기록\n\n- KNOWLEDGE 2026-10-22");
    const second = appendKnowledgeEvent(`${first}\n## 뒤 섹션\n\n내용\n`, b);
    expect(parseKnowledgeEvents(second)).toHaveLength(2);
    expect(second.indexOf("2026-10-23")).toBeLessThan(second.indexOf("## 뒤 섹션"));
  });
});

describe("lib predicates", () => {
  it("getWorkBranch prefers CI env over git and ignores PR merge refs", () => {
    const saved = { head: process.env.GITHUB_HEAD_REF, name: process.env.GITHUB_REF_NAME };
    try {
      process.env.GITHUB_HEAD_REF = "feature/from-pr";
      process.env.GITHUB_REF_NAME = "main";
      expect(getWorkBranch()).toBe("feature/from-pr");
      delete process.env.GITHUB_HEAD_REF;
      expect(getWorkBranch()).toBe("main");
      process.env.GITHUB_REF_NAME = "123/merge";
      expect(getWorkBranch()).not.toBe("123/merge");
    } finally {
      for (const [key, value] of [["GITHUB_HEAD_REF", saved.head], ["GITHUB_REF_NAME", saved.name]]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("unitIsFinal / artifactIsFinal follow the per-type final statuses", () => {
    withProject((projectRoot) => {
      const feature = path.join(projectRoot, "feature");
      writeFile(path.join(feature, "prd.md"), prdFile({ status: "pre-approved" }));
      expect(unitIsFinal(feature, "feature")).toBe(false);
      writeFile(path.join(feature, "prd.md"), prdFile());
      expect(unitIsFinal(feature, "feature")).toBe(true);
      const bug = path.join(projectRoot, "bug");
      writeFile(path.join(bug, "bugfix.md"), bugfixFile({ status: "review" }));
      expect(unitIsFinal(bug, "bugfix")).toBe(false);
      writeFile(path.join(bug, "bugfix.md"), bugfixFile());
      expect(unitIsFinal(bug, "bugfix")).toBe(true);
      expect(unitIsFinal(feature, "chore")).toBe(false);
    });
    expect(artifactIsFinal("adr.md", "accepted")).toBe(true);
    expect(artifactIsFinal("adr.md", "superseded")).toBe(true);
    expect(artifactIsFinal("adr.md", "pre-accepted")).toBe(false);
    expect(artifactIsFinal("prd.md", "pre-approved")).toBe(false);
  });
});

// ─── 게이트 ─────────────────────────────────────────────────────────────────
describe("knowledge gates", () => {
  it("passes a clean fixture", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot);
      const result = check(projectRoot);
      expect(result.all).toContain("ok");
      expect(result.status).toBe(0);
    });
  });

  it("skips every gate except K9 when the marker is absent", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot, { commit: false });
      fs.rmSync(kpath(projectRoot, "index.md"));
      writeFile(kpath(projectRoot, "gotchas", "깨진.md"), "### 아무거나\n");
      writeFile(kpath(projectRoot, "stray.txt"), "x");
      const result = check(projectRoot);
      expect(result.status).toBe(0);
      expect(result.all).not.toContain("[K");
    });
  });

  it("K1: stray files, undeclared area and mismatched file name", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      writeFile(kpath(projectRoot, "extra.md"), "x");
      writeFile(kpath(projectRoot, "gotchas", "유령.md"), "---\narea: 유령영역\n---\n");
      writeFile(kpath(projectRoot, "gotchas", "엉뚱한이름.md"), "---\narea: 결제\n---\n");
      const lines = gateLines(check(projectRoot), "K1").join("\n");
      expect(lines).toContain("extra.md");
      expect(lines).toContain('area "유령영역"');
      expect(lines).toContain("파일명이 area와 맞지 않습니다");
    });
  });

  it("K1: leaked wiki authoring guidance in a knowledge file", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      writeFile(kpath(projectRoot, "gotchas", "결제.md"), "---\narea: 결제\n---\n\n이 한 장은 에이전트가 읽는다\n");
      expect(gateLines(check(projectRoot), "K1").join("\n")).toContain("작성 규칙");
    });
  });

  it("K2: malformed heading, duplicate id, kind/dir mismatch and invalid date", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot, {
        inv: [INV_ENTRY, GOTCHA_ENTRY, "### INV-261322-bad-date: x\n> area: 결제\n"],
        gotchas: [GOTCHA_ENTRY, GOTCHA_ENTRY, "### G-26102-short: 짧은 날짜\n"],
      });
      const lines = gateLines(check(projectRoot), "K2").join("\n");
      expect(lines).toContain("ID가 중복입니다");
      expect(lines).toContain("파일에는 INV- 접두 항목만");
      expect(lines).toContain("유효한 YYMMDD가 아닙니다");
      expect(lines).toContain("형식(### G|INV-YYMMDD-slug: 제목)에 맞지 않습니다");
    });
  });

  it("K3: missing meta, bad enum, first-area mismatch, placeholder tokens and size warnings", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      const longEntry = `${GOTCHA_ENTRY.replace("retry-idempotency", "long-entry")}${"\n줄".repeat(14)}\n`;
      addKnowledge(projectRoot, {
        inv: [
          INV_ENTRY.replace("봉인: `src/pay/retry.test.ts`", "봉인: 아무말"),
          INV_ENTRY.replace("pay-retry-once", "area-mismatch").replace("area: 결제", "area: 다른영역"),
          INV_ENTRY.replace("pay-retry-once", "placeholder-left").replace("한 번만 한다", "{명령형 규칙 한 문장}"),
        ],
        gotchas: [
          GOTCHA_ENTRY.replace("유형: 규칙부재", "유형: 이상한값"),
          GOTCHA_ENTRY.replace("retry-idempotency", "no-source").replace(" · 출처: docs/raw/bugfix/pay-dup/bugfix.md, PR#123, `abc1234`", ""),
          longEntry,
        ],
      });
      const result = check(projectRoot);
      const lines = gateLines(result, "K3").join("\n");
      expect(lines).toContain("봉인은 백틱 테스트 경로");
      expect(lines).toContain('첫 area("다른영역")');
      expect(lines).toContain("채우지 않은 골격 토큰");
      expect(lines).toContain("유형은 규칙부재");
      expect(lines).toContain("메타 필드가 없습니다: 출처");
      expect(lines).toContain("항목이 ");
    });
  });

  it("K3: warns (not errors) on oversized entries and files", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      const longEntry = `${GOTCHA_ENTRY}${"\n줄".repeat(14)}\n`;
      addKnowledge(projectRoot, { inv: [], gotchas: [longEntry] });
      const result = check(projectRoot);
      expect(result.status).toBe(0);
      expect(result.out).toContain("warning: [K3]");
    });
  });

  it("K4: missing source file, missing fragment and non-final source", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "wip", "prd.md"), prdFile({ status: "review" }));
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "wip", "adr.md"), adrFile({ status: "proposed" }));
      addKnowledge(projectRoot, {
        inv: [
          INV_ENTRY.replace("pay-retry-once", "no-file").replace("pay-retry/adr.md#결정-1", "ghost/adr.md#결정-1"),
          INV_ENTRY.replace("pay-retry-once", "no-fragment").replace("#결정-1", "#결정-9"),
          INV_ENTRY.replace("pay-retry-once", "not-final").replace("pay-retry/adr.md#결정-1", "wip/adr.md#결정-1"),
          INV_ENTRY.replace("pay-retry-once", "pr-only").replace("docs/raw/feature/pay-retry/adr.md#결정-1", "PR#7"),
        ],
        gotchas: [],
      });
      const result = check(projectRoot);
      const k4 = gateLines(result, "K4").join("\n");
      expect(k4).toContain("출처 파일이 없습니다");
      expect(k4).toContain("fragment가 실재하지 않습니다");
      expect(k4).toContain("final이 아닙니다");
      expect(gateLines(result, "K3").join("\n")).toContain("PR/커밋만으로는");
    });
  });

  it("K5: fully superseded source errors, partial supersede matches by fragment", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot, { inv: [INV_ENTRY], gotchas: [] });
      // 부분 supersede: 결정-2만 대체 → 결정-1을 출처로 둔 불변식은 영향 없음
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "newer", "adr.md"), adrFile({ supersedes: "../pay-retry/adr.md#결정-2" }));
      expect(gateLines(check(projectRoot), "K5")).toEqual([]);
      // 부분 supersede가 같은 fragment(결정-1)를 가리키면 재판정 필요
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "newer", "adr.md"), adrFile({ supersedes: "../pay-retry/adr.md#결정-1" }));
      expect(gateLines(check(projectRoot), "K5").join("\n")).toContain("재판정 필요");
      // ADR 전체 supersede(상태는 아직 accepted)는 warning
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "newer", "adr.md"), adrFile({ supersedes: "../pay-retry/adr.md" }));
      const warned = check(projectRoot);
      expect(warned.status).toBe(0);
      expect(warned.out).toContain("warning: [K5]");
      // 출처 ADR이 superseded 상태가 되면 error
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "adr.md"), adrFile({ status: "superseded" }));
      expect(gateLines(check(projectRoot), "K5").join("\n")).toContain("재판정 필요");
      // 다른 ADR을 출처에 추가하면 해소
      const second = INV_ENTRY.replace(
        "adr.md#결정-1 ·",
        "adr.md#결정-1, docs/raw/feature/newer/adr.md#결정-1 ·",
      );
      addKnowledge(projectRoot, { inv: [second], gotchas: [] });
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "newer", "adr.md"), adrFile());
      expect(gateLines(check(projectRoot), "K5")).toEqual([]);
    });
  });

  it("K6: missing code anchor errors with the reanchor hint, missing seal only warns", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot, {
        inv: [INV_ENTRY.replace("src/pay/retry.test.ts", "src/pay/gone.test.ts")],
        gotchas: [GOTCHA_ENTRY.replace("`src/pay/retry.ts`,", "`src/pay/missing.ts`,")],
      });
      const result = check(projectRoot);
      const k6 = gateLines(result, "K6").join("\n");
      expect(k6).toContain("error: [K6]");
      expect(k6).toContain("src/pay/missing.ts");
      expect(k6).toContain("knowledge.mjs");
      expect(k6).toContain("reanchor");
      expect(k6).toContain("warning: [K6]");
      expect(k6).toContain("src/pay/gone.test.ts");
    });
  });

  it("K7: tombstone chains must end at an active id or 폐기, without cycles", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot, { inv: [INV_ENTRY], gotchas: [GOTCHA_ENTRY] });
      const head = "| ID | 상태 | 대체 | 사유 |\n| --- | --- | --- | --- |\n";
      writeFile(
        kpath(projectRoot, "_tombstones.md"),
        `${head}| G-261001-old-one | 통합 | G-261002-old-two | 합침 |\n| G-261002-old-two | 대체 | G-261022-retry-idempotency | 대체 |\n| G-261003-dead-end | 폐기 | - | 사라짐 |\n`,
      );
      expect(gateLines(check(projectRoot), "K7")).toEqual([]);
      writeFile(
        kpath(projectRoot, "_tombstones.md"),
        `${head}| G-261001-cyc-a | 통합 | G-261002-cyc-b | x |\n| G-261002-cyc-b | 통합 | G-261001-cyc-a | x |\n| G-261003-no-to | 통합 | - | x |\n| G-261004-bad-state | 삭제 | - | x |\n| G-261005-ghost | 대체 | G-269999-nowhere | x |\n| G-261022-retry-idempotency | 폐기 | - | 활성과 겹침 |\n`,
      );
      const k7 = gateLines(check(projectRoot), "K7").join("\n");
      expect(k7).toContain("순환");
      expect(k7).toContain("대체 ID가 필요");
      expect(k7).toContain("상태는 통합|폐기|대체");
      expect(k7).toContain("존재하지 않는 ID");
      expect(k7).toContain("활성 항목인데 묘비에도 있습니다");
    });
  });

  it("K8: a committed id may not vanish; retire keeps it as a tombstone", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot, { commit: false });
      addKnowledge(projectRoot, { inv: [INV_ENTRY], gotchas: [GOTCHA_ENTRY] });
      commitAll(projectRoot, "knowledge");
      expect(gateLines(check(projectRoot), "K8")).toEqual([]);

      writeFile(kpath(projectRoot, "gotchas", "결제.md"), gotchaFile());
      expect(gateLines(check(projectRoot), "K8").join("\n")).toContain("G-261022-retry-idempotency");

      // 되돌리고 retire로 내리면 묘비가 ID를 보존해 통과한다.
      git(projectRoot, ["checkout", "--", "."]);
      const retired = knowledge(projectRoot, ["retire", "--id", "G-261022-retry-idempotency", "--state", "폐기", "--reason", "더는 해당 없음"]);
      expect(retired.status).toBe(0);
      expect(gateLines(check(projectRoot), "K8")).toEqual([]);
      expect(read(kpath(projectRoot, "_tombstones.md"))).toContain("| G-261022-retry-idempotency | 폐기 | - | 더는 해당 없음 |");
      expect(read(kpath(projectRoot, "gotchas", "결제.md"))).not.toContain("G-261022-retry-idempotency");
    });
  });

  it("K9: in-progress bootstrap is refused on the base branch (no marker needed), honoring CI env", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      fs.rmSync(kpath(projectRoot, "index.md"));
      writeFile(kpath(projectRoot, "bootstrap.md"), "---\nstatus: in-progress\nbase_commit: x\nplan_hash: y\n---\n");
      expect(gateLines(check(projectRoot), "K9").join("\n")).toContain("베이스");

      git(projectRoot, ["checkout", "-q", "-b", "chore/knowledge-bootstrap"]);
      expect(gateLines(check(projectRoot), "K9")).toEqual([]);
      // CI는 detached HEAD라도 GITHUB_HEAD_REF/GITHUB_REF_NAME이 브랜치를 말해 준다.
      expect(gateLines(check(projectRoot, { GITHUB_HEAD_REF: "main" }), "K9")).toHaveLength(1);
      git(projectRoot, ["checkout", "-q", "main"]);
      expect(gateLines(check(projectRoot, { GITHUB_HEAD_REF: "chore/knowledge-bootstrap" }), "K9")).toEqual([]);
      expect(gateLines(check(projectRoot, { GITHUB_REF_NAME: "main" }), "K9")).toHaveLength(1);
    });
  });

  it("K10: unknown ids in AGENTS.md/docs error, fenced ones and tombstoned ones do not", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot, { inv: [INV_ENTRY], gotchas: [] });
      writeFile(kpath(projectRoot, "_tombstones.md"), "| ID | 상태 | 대체 | 사유 |\n| --- | --- | --- | --- |\n| G-261001-retired-one | 폐기 | - | x |\n");
      writeFile(path.join(projectRoot, "docs", "guide.md"), "참고 INV-261022-pay-retry-once 와 G-261001-retired-one\n\n```\nG-269999-in-fence\n```\n");
      expect(gateLines(check(projectRoot), "K10")).toEqual([]);
      fs.appendFileSync(path.join(projectRoot, "AGENTS.md"), "\n결정은 G-269999-nowhere-near 참고\n");
      const k10 = gateLines(check(projectRoot), "K10").join("\n");
      expect(k10).toContain("AGENTS.md");
      expect(k10).toContain("G-269999-nowhere-near");
      expect(k10).not.toContain("in-fence");
    });
  });

  it("K11: warns when the current branch unit is final without a KNOWLEDGE event", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      git(projectRoot, ["checkout", "-q", "-b", "feature/pay-retry"]);
      const warned = check(projectRoot);
      expect(warned.status).toBe(0);
      expect(warned.out).toContain("warning: [K11]");
      const recorded = knowledge(projectRoot, ["record", "--unit", "docs/raw/feature/pay-retry", "--invariants", "none", "--gotchas", "none", "--via", "make-pr"]);
      expect(recorded.status).toBe(0);
      expect(check(projectRoot).out).not.toContain("[K11]");
    });
  });

  it("artifact-check surfaces knowledge gate errors in consumer mode", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot, { inv: [INV_ENTRY.replace("#결정-1", "#결정-9")], gotchas: [] });
      const result = spawnSync(process.execPath, [ARTIFACT_CHECK], { cwd: projectRoot, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("[harness:check] error: [K4]");
    });
  });

  it("artifact-check validates #fragment on ADR supersedes", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "newer", "adr.md"), adrFile({ supersedes: "../pay-retry/adr.md#결정-9" }));
      const result = spawnSync(process.execPath, [ARTIFACT_CHECK], { cwd: projectRoot, encoding: "utf8" });
      expect(result.stderr).toContain("adr.md supersedes points to a missing fragment");
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "newer", "adr.md"), adrFile({ supersedes: "../pay-retry/adr.md#결정-2" }));
      const ok = spawnSync(process.execPath, [ARTIFACT_CHECK], { cwd: projectRoot, encoding: "utf8" });
      expect(ok.stderr).not.toContain("missing fragment");
    });
  });
});

// ─── CLI ────────────────────────────────────────────────────────────────────
describe("knowledge CLI", () => {
  it("prints the inactive line and exits 0 for read commands without a marker", () => {
    withProject((projectRoot) => {
      git(projectRoot, ["init", "-q"]);
      for (const args of [["brief", "--paths", "src/a.ts"], ["show", "G-261022-a-b"], ["pending"], ["reanchor"]]) {
        const result = knowledge(projectRoot, args);
        expect(result.status).toBe(0);
        expect(result.out.trim()).toBe("(지식 계층 미활성 — /lph-doctor 참고)");
      }
      expect(knowledge(projectRoot, ["status"]).out.split("\n")[0]).toBe("knowledge=inactive");
    });
  });

  it("seed is idempotent and creates the marker plus an empty tombstone table", () => {
    withProject((projectRoot) => {
      git(projectRoot, ["init", "-q"]);
      expect(knowledge(projectRoot, ["seed"]).status).toBe(0);
      const index = read(kpath(projectRoot, "index.md"));
      expect(index).toContain("lph-knowledge: 1");
      expect(index).toContain("bootstrap: not-needed");
      expect(read(kpath(projectRoot, "_tombstones.md"))).toContain("| ID | 상태 | 대체 | 사유 |");
      fs.appendFileSync(kpath(projectRoot, "index.md"), "\n추가\n");
      expect(knowledge(projectRoot, ["seed"]).out).toContain("이미 시드됨");
      expect(read(kpath(projectRoot, "index.md"))).toContain("추가");
      expect(knowledge(projectRoot, ["status"]).out.split("\n")[0]).toBe("knowledge=active");
    });
  });

  it("scaffold appends a skeleton that fails the gates until filled, then passes", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      const g = knowledge(projectRoot, ["scaffold", "--kind", "G", "--area", "결제", "--slug", "retry-timing", "--title", "재시도 간격을 지킨다"]);
      expect(g.status).toBe(0);
      const gotchaId = g.out.split("\n")[0];
      expect(gotchaId).toMatch(/^G-\d{6}-retry-timing$/);
      expect(read(kpath(projectRoot, "gotchas", "결제.md"))).toContain(`### ${gotchaId}: 재시도 간격을 지킨다`);
      expect(read(kpath(projectRoot, "gotchas", "결제.md"))).toMatch(/^---\narea: 결제\n---/);
      expect(gateLines(check(projectRoot), "K3").join("\n")).toContain("채우지 않은 골격 토큰");

      const filled = read(kpath(projectRoot, "gotchas", "결제.md"))
        .replace("{규칙부재|규칙불충분|잘못된추론|외부제약}", "규칙불충분")
        .replace("{출처}", "PR#9")
        .replace("{코드}", "`src/pay/retry.ts`")
        .replace("{해야 할 것 / 하면 안 되는 것}", "간격을 지킨다")
        .replace("{실제로 생긴 일}", "연속 재시도로 한도를 넘겼다");
      writeFile(kpath(projectRoot, "gotchas", "결제.md"), filled);
      expect(check(projectRoot).all).toContain("ok");

      const unconfirmed = knowledge(projectRoot, ["scaffold", "--kind", "INV", "--area", "결제", "--slug", "pay-x", "--title", "규범", "--unconfirmed"]);
      expect(read(kpath(projectRoot, "invariants", "결제.md"))).toContain(": 규범 (미확인)");
      expect(unconfirmed.out.split("\n")[0]).toMatch(/^INV-\d{6}-pay-x$/);
    });
  });

  it("scaffold rejects undeclared areas, duplicate ids and bad slugs; _common is always allowed", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      expect(knowledge(projectRoot, ["scaffold", "--kind", "G", "--area", "없는영역", "--slug", "a-b"]).status).toBe(1);
      expect(knowledge(projectRoot, ["scaffold", "--kind", "G", "--area", "결제", "--slug", "Bad_Slug"]).status).toBe(1);
      expect(knowledge(projectRoot, ["scaffold", "--kind", "X", "--area", "결제", "--slug", "a-b"]).status).toBe(1);
      expect(knowledge(projectRoot, ["scaffold", "--kind", "G", "--area", "결제", "--slug", "a".repeat(33)]).status).toBe(1);
      expect(knowledge(projectRoot, ["scaffold", "--kind", "G", "--area", "_common", "--slug", "shared-rule"]).status).toBe(0);
      expect(fs.existsSync(kpath(projectRoot, "gotchas", "_common.md"))).toBe(true);
      expect(knowledge(projectRoot, ["scaffold", "--kind", "G", "--area", "_common", "--slug", "shared-rule"]).all).toContain("ID가 이미 있습니다");
    });
  });

  it("retire requires --to for 통합/대체 and rejects unknown or inactive ids", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot);
      expect(knowledge(projectRoot, ["retire", "--id", "G-261022-retry-idempotency", "--state", "통합", "--reason", "합침"]).status).toBe(1);
      expect(knowledge(projectRoot, ["retire", "--id", "G-261022-retry-idempotency", "--state", "통합", "--to", "G-269999-nope-x", "--reason", "합침"]).status).toBe(1);
      expect(knowledge(projectRoot, ["retire", "--id", "G-261022-ghost-x", "--state", "폐기", "--reason", "x"]).status).toBe(1);
      expect(knowledge(projectRoot, ["retire", "--id", "G-261022-retry-idempotency", "--state", "대체", "--to", "INV-261022-pay-retry-once", "--reason", "불변식으로 승격 | 표 깨짐 방지"]).status).toBe(0);
      expect(read(kpath(projectRoot, "_tombstones.md"))).toContain("| G-261022-retry-idempotency | 대체 | INV-261022-pay-retry-once | 불변식으로 승격 / 표 깨짐 방지 |");
      expect(gateLines(check(projectRoot), "K7")).toEqual([]);
      expect(knowledge(projectRoot, ["retire", "--id", "G-261022-retry-idempotency", "--state", "폐기", "--reason", "x"]).all).toContain("이미 비활성");
    });
  });

  it("reanchor follows git renames, previews by default and rewrites with --apply", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot, { commit: false });
      addKnowledge(projectRoot);
      commitAll(projectRoot, "knowledge");
      expect(knowledge(projectRoot, ["reanchor"]).out).toContain("끊긴 앵커 없음");

      fs.mkdirSync(path.join(projectRoot, "src", "billing"), { recursive: true });
      git(projectRoot, ["mv", "src/pay/retry.ts", "src/billing/retry.ts"]);
      commitAll(projectRoot, "move");
      expect(gateLines(check(projectRoot), "K6").length).toBeGreaterThan(0);

      const preview = knowledge(projectRoot, ["reanchor"]);
      expect(preview.out).toContain("src/pay/retry.ts → src/billing/retry.ts");
      expect(read(kpath(projectRoot, "invariants", "결제.md"))).toContain("src/pay/retry.ts:scheduleRetry");

      const applied = knowledge(projectRoot, ["reanchor", "--apply"]);
      expect(applied.out).toContain("적용 2건");
      expect(read(kpath(projectRoot, "invariants", "결제.md"))).toContain("`src/billing/retry.ts:scheduleRetry`");
      expect(read(kpath(projectRoot, "gotchas", "결제.md"))).toContain("`src/billing/retry.ts`, `src/pay/api.ts:submit`");
      expect(gateLines(check(projectRoot), "K6")).toEqual([]);
    });
  });

  it("reanchor lists anchors it cannot trace", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot, { commit: false });
      addKnowledge(projectRoot);
      commitAll(projectRoot, "knowledge");
      git(projectRoot, ["rm", "-q", "src/pay/api.ts"]);
      const result = knowledge(projectRoot, ["reanchor"]);
      expect(result.out).toContain("src/pay/api.ts (이동 이력 없음)");
      expect(knowledge(projectRoot, ["reanchor", "--apply"]).out).toContain("적용 0건");
    });
  });

  describe("record", () => {
    it("--auto records none(auto) for a clean feature and reports needs-judgment otherwise", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        // accepted ADR가 있는 feature는 판단이 필요하다
        const accepted = knowledge(projectRoot, ["record", "--unit", "docs/raw/feature/pay-retry", "--auto", "--via", "make-pr"]);
        expect(accepted.status).toBe(0);
        expect(accepted.out.trim()).toBe("needs-judgment");
        expect(read(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "state.md"))).not.toContain("KNOWLEDGE");

        // ADR가 accepted가 아니고 지식 후보가 비어 있으면 자동 none
        writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "adr.md"), adrFile({ status: "proposed" }));
        writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "notes.md"), "# Notes\n\n## 지식 후보\n\n> 안내 문구\n\n-\n\n## 검증\n\n- x\n");
        const auto = knowledge(projectRoot, ["record", "--unit", "docs/raw/feature/pay-retry", "--auto", "--via", "make-pr"]);
        expect(auto.out.trim()).toBe("auto: none(auto) 기록");
        const state = read(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "state.md"));
        expect(state).toMatch(/^## 지식 기록\n\n- KNOWLEDGE \d{4}-\d{2}-\d{2} invariants=none\(auto\) gotchas=none\(auto\) via=make-pr$/m);

        // 이미 기록된 단위는 다시 판정하지 않는다(재시도·재개 멱등)
        writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "notes.md"), "# Notes\n\n## 지식 후보\n\n- 재시도 간격 함정\n");
        expect(knowledge(projectRoot, ["record", "--unit", "docs/raw/feature/pay-retry", "--auto", "--via", "make-pr"]).out.trim()).toBe("already-recorded");

        // 기록 전이라면 지식 후보에 실제 내용이 있을 때 판단 필요
        writeFile(path.join(projectRoot, "docs", "raw", "feature", "pay-retry", "state.md"), stateFile());
        expect(knowledge(projectRoot, ["record", "--unit", "docs/raw/feature/pay-retry", "--auto", "--via", "make-pr"]).out.trim()).toBe("needs-judgment");
      });
    });

    it("bugfix always needs judgment, chore is always none(auto)", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        expect(knowledge(projectRoot, ["record", "--unit", "docs/raw/bugfix/pay-dup", "--auto", "--via", "make-pr"]).out.trim()).toBe("needs-judgment");
        writeFile(path.join(projectRoot, "docs", "raw", "chore", "tidy", "notes.md"), "# Chore\n\n## 지식 후보\n\n- 내용이 있어도 chore는 자동\n");
        writeFile(path.join(projectRoot, "docs", "raw", "chore", "tidy", "state.md"), stateFile());
        expect(knowledge(projectRoot, ["record", "--unit", "docs/raw/chore/tidy", "--auto", "--via", "one-shot"]).out.trim()).toBe("auto: none(auto) 기록");
      });
    });

    it("explicit ids must be active; success appends a parseable event under the section", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        addKnowledge(projectRoot);
        const unit = "docs/raw/bugfix/pay-dup";
        const bad = knowledge(projectRoot, ["record", "--unit", unit, "--invariants", "INV-261022-nope-x", "--via", "make-pr"]);
        expect(bad.status).toBe(1);
        expect(bad.err).toContain("활성 지식 ID가 아닙니다");
        const ok = knowledge(projectRoot, ["record", "--unit", unit, "--invariants", "INV-261022-pay-retry-once", "--gotchas", "G-261022-retry-idempotency", "--via", "feedback"]);
        expect(ok.status).toBe(0);
        const events = parseKnowledgeEvents(read(path.join(projectRoot, unit, "state.md")));
        expect(events).toEqual([
          { date: expect.any(String), invariants: ["INV-261022-pay-retry-once"], gotchas: ["G-261022-retry-idempotency"], auto: false, via: "feedback" },
        ]);
        expect(knowledge(projectRoot, ["record", "--unit", unit, "--auto", "--via", "bogus"]).status).toBe(1);
      });
    });

    it("errors for legacy units without state.md and no-ops when the layer is inactive", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        fs.rmSync(path.join(projectRoot, "docs", "raw", "bugfix", "pay-dup", "state.md"));
        const legacy = knowledge(projectRoot, ["record", "--unit", "docs/raw/bugfix/pay-dup", "--auto", "--via", "make-pr"]);
        expect(legacy.status).toBe(1);
        expect(legacy.err).toContain("레거시 단위는 bootstrap 원장으로 처리");
        fs.rmSync(kpath(projectRoot, "index.md"));
        const inactive = knowledge(projectRoot, ["record", "--unit", "docs/raw/feature/pay-retry", "--auto", "--via", "make-pr"]);
        expect(inactive.status).toBe(0);
        expect(inactive.out).toContain("미활성");
      });
    });
  });

  it("pending lists final units with no KNOWLEDGE event and no ledger row; status reports counts", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot);
      writeFile(path.join(projectRoot, "docs", "raw", "feature", "draft-one", "prd.md"), prdFile({ status: "review" }));
      const before = knowledge(projectRoot, ["pending"]);
      expect(before.out.split("\n")[0]).toBe("pending=2");
      expect(before.out).toContain("- docs/raw/feature/pay-retry");
      expect(before.out).not.toContain("draft-one");

      knowledge(projectRoot, ["record", "--unit", "docs/raw/bugfix/pay-dup", "--gotchas", "G-261022-retry-idempotency", "--via", "make-pr"]);
      expect(knowledge(projectRoot, ["pending"]).out.split("\n")[0]).toBe("pending=1");

      const status = knowledge(projectRoot, ["status"]).out.split("\n");
      expect(status[0]).toBe("knowledge=active");
      expect(status[1]).toBe("영역별 활성: 결제 G1·INV1");
      expect(status[2]).toBe("pending: 1건");
      expect(status[3]).toBe("final 단위: 2");
    });
  });

  it("status flags legacy gotchas files in other formats", () => {
    withProject((projectRoot) => {
      git(projectRoot, ["init", "-q"]);
      writeFile(path.join(projectRoot, "docs", "gotchas.md"), "# 예전 함정\n");
      const out = knowledge(projectRoot, ["status"]).out;
      expect(out).toContain("knowledge=inactive");
      expect(out).toContain("docs/gotchas.md");
    });
  });

  describe("brief", () => {
    const entry = (id, anchors, extra = "") =>
      `### ${id}: 규칙 ${id}\n> 발견: 2026-10-22 · 유형: 규칙부재 · area: 결제 · 출처: PR#1 · 코드: ${anchors}\n\n**규칙:** 규칙 본문 ${id}${extra}\n\n**왜:** 이유\n`;

    it("ranks exact path > same directory > shared two-level prefix, drops score 0", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        writeFile(
          kpath(projectRoot, "gotchas", "결제.md"),
          gotchaFile(
            entry("G-261001-unrelated-one", "`lib/other/x.ts`"),
            entry("G-261002-deep-prefix", "`src/pay/sub/deep.ts`"),
            entry("G-261003-same-dir", "`src/pay/api.ts`"),
            entry("G-261004-exact-hit", "`src/pay/retry.ts:run`"),
          ),
        );
        const out = knowledge(projectRoot, ["brief", "--paths", "src/pay/retry.ts"]).out;
        const order = [...out.matchAll(/^(G-\d{6}-[a-z-]+): /gm)].map((match) => match[1]);
        expect(order).toEqual(["G-261004-exact-hit", "G-261003-same-dir", "G-261002-deep-prefix"]);
        expect(out).toContain("  규칙: 규칙 본문 G-261004-exact-hit");
        expect(out).toContain("  코드: `src/pay/retry.ts:run`");
        expect(knowledge(projectRoot, ["brief", "--paths", "docs/none.md"]).out.trim()).toBe("(관련 항목 없음)");
      });
    });

    it("breaks score ties by newest date and honors --limit with an omitted count", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        const mk = (id, date) => entry(id, "`src/pay/retry.ts`").replace("발견: 2026-10-22", `발견: ${date}`);
        writeFile(
          kpath(projectRoot, "gotchas", "결제.md"),
          gotchaFile(mk("G-250101-old-one", "2025-01-01"), mk("G-261001-new-one", "2026-10-01"), mk("G-260601-mid-one", "2026-06-01")),
        );
        const out = knowledge(projectRoot, ["brief", "--paths", "src/pay/retry.ts", "--limit", "2"]).out;
        expect([...out.matchAll(/^(G-\d{6}-[a-z-]+): /gm)].map((match) => match[1])).toEqual(["G-261001-new-one", "G-260601-mid-one"]);
        expect(out).toContain("+1건 생략 — knowledge.mjs show <ID>");
      });
    });

    it("caps output near 6000 bytes and reports the rest as omitted", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        const anchors = Array.from({ length: 25 }, (_, index) => `\`src/pay/file${String(index).padStart(2, "0")}.ts\``).join(", ");
        const entries = Array.from({ length: 15 }, (_, index) => entry(`G-26100${(index % 9) + 1}-cap-item-${index}`, anchors));
        writeFile(kpath(projectRoot, "gotchas", "결제.md"), gotchaFile(...entries));
        const out = knowledge(projectRoot, ["brief", "--paths", "src/pay/file01.ts"]).out;
        expect(Buffer.byteLength(out)).toBeLessThan(6300);
        expect(out).toMatch(/\+\d+건 생략 — knowledge\.mjs show <ID>/);
        expect(out.match(/^G-/gm).length).toBeLessThan(12);
      });
    });

    it("supports --area and --ids (including retired ids), show and refs exit codes", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        addKnowledge(projectRoot);
        writeFile(kpath(projectRoot, "_tombstones.md"), "| ID | 상태 | 대체 | 사유 |\n| --- | --- | --- | --- |\n| G-261001-retired-one | 폐기 | - | 끝 |\n");
        expect(knowledge(projectRoot, ["brief", "--area", "결제"]).out).toContain("INV-261022-pay-retry-once: 결제 재시도는 한 번만 한다");
        expect(knowledge(projectRoot, ["brief", "--area", "없는영역"]).out.trim()).toBe("(관련 항목 없음)");
        const ids = knowledge(projectRoot, ["brief", "--ids", "INV-261022-pay-retry-once,G-261001-retired-one,G-269999-gone-x"]).out;
        expect(ids).toContain("INV-261022-pay-retry-once:");
        expect(ids).toContain("G-261001-retired-one: (비활성 — 폐기)");
        expect(ids).toContain("G-269999-gone-x: (없음)");

        const shown = knowledge(projectRoot, ["show", "INV-261022-pay-retry-once", "G-261001-retired-one"]);
        expect(shown.status).toBe(0);
        expect(shown.out).toContain("**위반 시:** 중복 결제가 발생한다");
        expect(shown.out).toContain("묘비: G-261001-retired-one | 폐기");
        expect(knowledge(projectRoot, ["show", "G-269999-gone-x"]).status).toBe(1);

        const refsOk = knowledge(projectRoot, ["refs", "INV-261022-pay-retry-once", "G-261001-retired-one"]);
        expect(refsOk.status).toBe(0);
        expect(refsOk.out).toContain("ok INV-261022-pay-retry-once");
        const refsBad = knowledge(projectRoot, ["refs", "INV-261022-pay-retry-once", "G-269999-gone-x"]);
        expect(refsBad.status).toBe(1);
        expect(refsBad.out).toContain("unknown G-269999-gone-x");
      });
    });
  });
});

// ─── 부트스트랩 ─────────────────────────────────────────────────────────────
const AREAS = ["영역A", "영역B", "영역C", "영역D", "영역E"];

// 합성 레포: feature 120(승인) + bugfix 100(수정) + chore 60 + 미완 feature 20(대상 제외).
function bootstrapProject(projectRoot) {
  git(projectRoot, ["init", "-q"]);
  git(projectRoot, ["checkout", "-q", "-b", "main"]);
  harnessInit(projectRoot);
  const raw = (...parts) => path.join(projectRoot, "docs", "raw", ...parts);
  for (let i = 0; i < 120; i += 1) {
    const slug = `feat-${String(i).padStart(3, "0")}`;
    writeFile(raw("feature", slug, "prd.md"), prdFile({ area: AREAS[i % 5], date: `2025-${String((i % 12) + 1).padStart(2, "0")}-10` }).replace("# PRD", `# PRD\n\n## 요구사항\n\n- 요구 ${i}\n\n## 수용 기준\n\n- 기준 ${i}\n`));
    writeFile(raw("feature", slug, "adr.md"), adrFile());
    writeFile(raw("feature", slug, "notes.md"), `# Notes\n\n## 결정\n\n- 결정 ${i}\n`);
  }
  for (let i = 0; i < 100; i += 1) {
    writeFile(raw("bugfix", `bug-${String(i).padStart(3, "0")}`, "bugfix.md"), `${bugfixFile({ area: AREAS[i % 5] })}\n## 원인\n\n- 원인 ${i}\n\n## 회귀 방지\n\n- 테스트 ${i}\n`);
  }
  for (let i = 0; i < 60; i += 1) {
    writeFile(raw("chore", `chore-${String(i).padStart(3, "0")}`, "notes.md"), `# Chore ${i}\n\n## 맥락\n\n- x\n`);
  }
  for (let i = 0; i < 20; i += 1) {
    writeFile(raw("feature", `wip-${String(i).padStart(3, "0")}`, "prd.md"), prdFile({ status: "review", area: AREAS[i % 5] }));
  }
  writeFile(path.join(projectRoot, "src", "a.ts"), "export {};\n");
  commitAll(projectRoot, "legacy units");
  git(projectRoot, ["checkout", "-q", "-b", "chore/knowledge-bootstrap"]);
}

function ledgerOf(projectRoot) {
  return parseBootstrapLedger(read(kpath(projectRoot, "bootstrap.md")));
}

function ledgerField(projectRoot, key) {
  return new RegExp(`^${key}: (.*)$`, "m").exec(read(kpath(projectRoot, "bootstrap.md")))[1];
}

function markAll(projectRoot, verdict, units) {
  for (let i = 0; i < units.length; i += 100) {
    const result = knowledge(projectRoot, ["bootstrap", "mark", "--units", units.slice(i, i + 100).join(","), "--verdict", verdict]);
    expect(result.status).toBe(0);
  }
}

describe("knowledge bootstrap (synthetic 300 units)", () => {
  it("plans deterministically: only final units + all chores, chores auto-judged, stats printed", { timeout: 120000 }, () => {
    withProject((projectRoot) => {
      bootstrapProject(projectRoot);
      const plan = knowledge(projectRoot, ["bootstrap", "plan"]);
      expect(plan.status).toBe(0);
      expect(plan.out).toContain("대상 280단위 (feature 120 · bugfix 100 · chore 60)");
      expect(plan.out).toContain("영역 영역A:");
      expect(plan.out).toMatch(/예상 토큰 ≈ \d+ · 권장 배치 수 ≈ \d+/);

      const ledger = ledgerOf(projectRoot);
      expect(ledger.rows).toHaveLength(280);
      expect(ledger.rows.filter((row) => row.verdict === "대기")).toHaveLength(220);
      expect(ledger.rows.filter((row) => row.verdict === "무기여(auto)")).toHaveLength(60);
      expect(ledger.rows.some((row) => row.unit.includes("/wip-"))).toBe(false);
      expect(ledgerField(projectRoot, "status")).toBe("in-progress");
      expect(ledgerField(projectRoot, "base_commit")).toBe(git(projectRoot, ["rev-parse", "HEAD"]).trim());

      const firstHash = ledgerField(projectRoot, "plan_hash");
      expect(firstHash).toMatch(/^[0-9a-f]{12}$/);
      expect(knowledge(projectRoot, ["bootstrap", "plan"]).all).toContain("이미 bootstrap이 진행 중");
      expect(knowledge(projectRoot, ["bootstrap", "plan", "--force"]).status).toBe(0);
      expect(ledgerField(projectRoot, "plan_hash")).toBe(firstHash);

      // git 디렉터리 캐시가 생기고, 캐시를 지워도 같은 해시로 재계산된다.
      const cachePath = path.join(projectRoot, ".git", "lph-knowledge-bootstrap", "plan.json");
      expect(fs.existsSync(cachePath)).toBe(true);
      fs.rmSync(cachePath);
      expect(knowledge(projectRoot, ["bootstrap", "plan", "--force"]).status).toBe(0);
      expect(ledgerField(projectRoot, "plan_hash")).toBe(firstHash);
    });
  });

  it("next-batch stays inside one area within the token budget, oldest first, and resumes after partial marks", { timeout: 120000 }, () => {
    withProject((projectRoot) => {
      bootstrapProject(projectRoot);
      knowledge(projectRoot, ["bootstrap", "plan"]);

      const batch = knowledge(projectRoot, ["bootstrap", "next-batch", "--max-tokens", "800"]);
      expect(batch.status).toBe(0);
      const units = [...batch.out.matchAll(/^=== 단위: (\S+) /gm)].map((match) => match[1]);
      expect(units.length).toBeGreaterThan(0);
      expect(units.length).toBeLessThan(44);
      expect(Buffer.byteLength(batch.out)).toBeLessThan(800 * 4 + 4000);
      const areas = new Set(units.map((unit) => ledgerOf(projectRoot).rows.find((row) => row.unit === unit).area));
      expect(areas.size).toBe(1);
      expect(batch.out).toMatch(/## 요구사항|## 원인/);
      expect(batch.out).toContain("--- 영역");

      markAll(projectRoot, "무기여", units);
      const next = knowledge(projectRoot, ["bootstrap", "next-batch", "--max-tokens", "800"]);
      const nextUnits = [...next.out.matchAll(/^=== 단위: (\S+) /gm)].map((match) => match[1]);
      expect(nextUnits.some((unit) => units.includes(unit))).toBe(false);

      const status = knowledge(projectRoot, ["bootstrap", "status"]);
      expect(status.out).toContain(`무기여 ${units.length}`);
      expect(status.out).toMatch(/커버리지: \d+\/280/);
      expect(status.out).toContain(`남은 대기: ${220 - units.length}`);
      expect(status.out).not.toContain("plan 변경됨");
    });
  });

  it("--force re-plans against a new HEAD, keeping recorded verdicts and adding new units as 대기", { timeout: 120000 }, () => {
    withProject((projectRoot) => {
      bootstrapProject(projectRoot);
      knowledge(projectRoot, ["bootstrap", "plan"]);
      const sample = ledgerOf(projectRoot).rows.filter((row) => row.verdict === "대기").slice(0, 3).map((row) => row.unit);
      markAll(projectRoot, "판정불가", sample);
      const oldHash = ledgerField(projectRoot, "plan_hash");

      writeFile(path.join(projectRoot, "docs", "raw", "bugfix", "late-fix", "bugfix.md"), bugfixFile({ area: AREAS[0] }));
      commitAll(projectRoot, "late unit");
      expect(knowledge(projectRoot, ["bootstrap", "plan", "--force"]).status).toBe(0);

      const rows = ledgerOf(projectRoot).rows;
      expect(rows).toHaveLength(281);
      for (const unit of sample) expect(rows.find((row) => row.unit === unit).verdict).toBe("판정불가");
      expect(rows.find((row) => row.unit.endsWith("/late-fix")).verdict).toBe("대기");
      expect(ledgerField(projectRoot, "plan_hash")).not.toBe(oldHash);
      expect(ledgerField(projectRoot, "base_commit")).toBe(git(projectRoot, ["rev-parse", "HEAD"]).trim());
    });
  });

  it("status detects plan drift when the ledger base_commit no longer matches its plan_hash", { timeout: 120000 }, () => {
    withProject((projectRoot) => {
      bootstrapProject(projectRoot);
      knowledge(projectRoot, ["bootstrap", "plan"]);
      writeFile(path.join(projectRoot, "docs", "raw", "bugfix", "late-fix", "bugfix.md"), bugfixFile({ area: AREAS[0] }));
      commitAll(projectRoot, "late unit");
      const newer = git(projectRoot, ["rev-parse", "HEAD"]).trim();

      const ledgerPath = kpath(projectRoot, "bootstrap.md");
      writeFile(ledgerPath, read(ledgerPath).replace(/^base_commit: .*$/m, `base_commit: ${newer}`));
      const status = knowledge(projectRoot, ["bootstrap", "status"]);
      expect(status.out).toContain("plan 변경됨 — bootstrap plan --force");

      markAll(projectRoot, "무기여", ledgerOf(projectRoot).rows.filter((row) => row.verdict === "대기").map((row) => row.unit));
      const finalize = knowledge(projectRoot, ["bootstrap", "finalize"]);
      expect(finalize.status).toBe(1);
      expect(finalize.err).toContain("plan_hash가 일치하지 않습니다");
      expect(fs.existsSync(kpath(projectRoot, "index.md"))).toBe(false);
    });
  });

  it("mark validates verdicts, requires --ids for 기여 and verifies them against active entries", { timeout: 120000 }, () => {
    withProject((projectRoot) => {
      bootstrapProject(projectRoot);
      knowledge(projectRoot, ["bootstrap", "plan"]);
      const unit = ledgerOf(projectRoot).rows.find((row) => row.verdict === "대기");
      expect(knowledge(projectRoot, ["bootstrap", "mark", "--units", unit.unit, "--verdict", "아무거나"]).status).toBe(1);
      expect(knowledge(projectRoot, ["bootstrap", "mark", "--units", unit.unit, "--verdict", "기여"]).err).toContain("--ids");
      expect(knowledge(projectRoot, ["bootstrap", "mark", "--units", unit.unit, "--verdict", "기여", "--ids", "G-261022-nope-x"]).err).toContain("활성 지식 ID가 아닙니다");
      expect(knowledge(projectRoot, ["bootstrap", "mark", "--units", "docs/raw/feature/ghost", "--verdict", "무기여"]).err).toContain("원장에 없는 단위");

      const area = unit.area;
      const scaffold = knowledge(projectRoot, ["scaffold", "--kind", "G", "--area", area, "--slug", "boot-rule"]);
      expect(scaffold.status).toBe(0);
      const id = scaffold.out.split("\n")[0];
      const gotchaPath = kpath(projectRoot, "gotchas", `${area}.md`);
      writeFile(
        gotchaPath,
        read(gotchaPath)
          .replace("{규칙부재|규칙불충분|잘못된추론|외부제약}", "외부제약")
          .replace("{출처}", unit.unit)
          .replace("{코드}", "`src/a.ts`")
          .replace("{명령형 규칙 한 문장}", "합성 규칙을 지킨다")
          .replace("{해야 할 것 / 하면 안 되는 것}", "지킨다")
          .replace("{실제로 생긴 일}", "합성"),
      );
      const marked = knowledge(projectRoot, ["bootstrap", "mark", "--units", unit.unit, "--verdict", "기여", "--ids", id, "--note", "합성 | 메모"]);
      expect(marked.status).toBe(0);
      expect(marked.out).toContain("mark: 1행 갱신");
      const row = ledgerOf(projectRoot).rows.find((entry) => entry.unit === unit.unit);
      expect(row).toMatchObject({ verdict: "기여", ids: [id], note: "합성 / 메모" });
    });
  });

  it("finalize refuses with 대기 rows, then succeeds: gates pass, marker created, status complete", { timeout: 120000 }, () => {
    withProject((projectRoot) => {
      bootstrapProject(projectRoot);
      knowledge(projectRoot, ["bootstrap", "plan"]);

      const early = knowledge(projectRoot, ["bootstrap", "finalize"]);
      expect(early.status).toBe(1);
      expect(early.err).toContain("판정 대기 행이 220건");
      expect(fs.existsSync(kpath(projectRoot, "index.md"))).toBe(false);

      const pending = ledgerOf(projectRoot).rows.filter((row) => row.verdict === "대기").map((row) => row.unit);
      const unreadable = pending.slice(0, 100);
      markAll(projectRoot, "판정불가", unreadable);
      markAll(projectRoot, "무기여", pending.slice(100));

      const done = knowledge(projectRoot, ["bootstrap", "finalize"]);
      expect(done.status).toBe(0);
      expect(done.out).toContain("warning: 판정불가 비율");
      expect(done.out).toContain("[bootstrap finalize] 완료");
      const index = read(kpath(projectRoot, "index.md"));
      expect(index).toContain("lph-knowledge: 1");
      expect(index).toContain("knowledge_schema: 1");
      expect(index).toContain("bootstrap: complete");
      expect(ledgerField(projectRoot, "status")).toBe("complete");
      expect(fs.existsSync(kpath(projectRoot, "_tombstones.md"))).toBe(true);

      // complete 이후엔 활성 상태이고, main에 올려도 K9가 막지 않는다.
      expect(knowledge(projectRoot, ["status"]).out.split("\n")[0]).toBe("knowledge=active");
      git(projectRoot, ["checkout", "-q", "main"]);
      expect(gateLines(check(projectRoot), "K9")).toEqual([]);
      expect(knowledge(projectRoot, ["bootstrap", "plan"]).all).toContain("이미 bootstrap이 완료");
      // 원장에 올라간 단위는 pending이 아니다.
      expect(knowledge(projectRoot, ["pending"]).out.split("\n")[0]).toBe("pending=0");
    });
  });

  it("finalize runs the knowledge gates in-process and refuses on errors", { timeout: 120000 }, () => {
    withProject((projectRoot) => {
      bootstrapProject(projectRoot);
      knowledge(projectRoot, ["bootstrap", "plan"]);
      markAll(projectRoot, "무기여", ledgerOf(projectRoot).rows.filter((row) => row.verdict === "대기").map((row) => row.unit));
      writeFile(kpath(projectRoot, "gotchas", "영역A.md"), "---\narea: 영역A\n---\n\n### 깨진 헤딩\n");
      const result = knowledge(projectRoot, ["bootstrap", "finalize"]);
      expect(result.status).toBe(1);
      expect(result.all).toContain("[K2]");
      expect(fs.existsSync(kpath(projectRoot, "index.md"))).toBe(false);
      expect(ledgerField(projectRoot, "status")).toBe("in-progress");
    });
  });
});

// ─── 리뷰 지적 회귀(결함 클래스별) ─────────────────────────────────────────
describe("knowledge review regressions", () => {
  const inProgressLedger = "---\nstatus: in-progress\nbase_commit: x\nplan_hash: y\npr_source: none\n---\n";

  it("K9 looks at the merge target in PR CI, where HEAD_REF is always a work branch", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      writeFile(kpath(projectRoot, "bootstrap.md"), inProgressLedger);
      git(projectRoot, ["checkout", "-q", "-b", "chore/knowledge-boot"]);
      const pr = { GITHUB_HEAD_REF: "chore/knowledge-boot", GITHUB_BASE_REF: "main" };
      expect(gateLines(check(projectRoot, pr), "K9").join("\n")).toContain("병합 대상이 베이스(main)");
      expect(gateLines(check(projectRoot, { GITHUB_HEAD_REF: "chore/knowledge-boot", GITHUB_BASE_REF: "feature/x" }), "K9")).toEqual([]);
      expect(gateLines(check(projectRoot, { GITHUB_HEAD_REF: "chore/knowledge-boot" }), "K9")).toEqual([]);
    });
  });

  it("K8 reads HEAD with the catalog parsers, so fenced example headings are not ids", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot, { commit: false });
      const fenced = (mark) => `${mark}md\n### G-261022-example-one: 예시\n| G-261022-example-two | 폐기 | - | 예시 |\n${mark}\n`;
      writeFile(kpath(projectRoot, "gotchas", "결제.md"), gotchaFile(GOTCHA_ENTRY, fenced("```"), fenced("~~~")));
      commitAll(projectRoot, "knowledge");
      const result = check(projectRoot);
      expect(gateLines(result, "K8")).toEqual([]);
      expect(gateLines(result, "K2")).toEqual([]);
      expect(gateLines(result, "K10")).toEqual([]);
    });
  });

  it("K8 compares against the PR base, not the merge commit HEAD, when GITHUB_BASE_REF is set", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot, { commit: false });
      addKnowledge(projectRoot);
      commitAll(projectRoot, "knowledge");
      git(projectRoot, ["update-ref", "refs/remotes/origin/main", "main"]);
      git(projectRoot, ["checkout", "-q", "-b", "feature/drop"]);
      writeFile(kpath(projectRoot, "gotchas", "결제.md"), gotchaFile());
      commitAll(projectRoot, "delete gotcha");
      expect(gateLines(check(projectRoot), "K8")).toEqual([]);
      expect(gateLines(check(projectRoot, { GITHUB_BASE_REF: "main" }), "K8").join("\n")).toContain("G-261022-retry-idempotency");
      // 기준 ref를 구할 수 없으면(얕은 clone) 건너뛴다.
      expect(gateLines(check(projectRoot, { GITHUB_BASE_REF: "nope" }), "K8")).toEqual([]);
    });
  });

  it("K3 only rejects the skeleton tokens the engine writes; prose braces pass and later checks still run", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      const braces = GOTCHA_ENTRY.replace("멱등키 없이 재시도하지 않는다", "응답 객체 {id, key}를 그대로 넘긴다").replace("`src/pay/api.ts:submit`", "`src/pay/gone.ts`");
      addKnowledge(projectRoot, { inv: [], gotchas: [braces] });
      const result = check(projectRoot);
      expect(gateLines(result, "K3")).toEqual([]);
      expect(gateLines(result, "K6").join("\n")).toContain("src/pay/gone.ts");
      expect(SKELETON_TOKENS.length).toBeGreaterThan(5);
    });
  });

  it("K6 hint is a runnable absolute path, not an unexpanded plugin-root variable", () => {
    withProject((projectRoot) => {
      seededProject(projectRoot);
      addKnowledge(projectRoot);
      fs.rmSync(path.join(projectRoot, "src", "pay", "api.ts"));
      const hint = gateLines(check(projectRoot), "K6").join("\n");
      expect(hint).toContain(KNOWLEDGE);
      expect(hint).not.toContain("CLAUDE_PLUGIN_ROOT");
    });
  });

  it("fences: ~~~ is honored by the entry parser and fragment checks ignore fenced headings and items", () => {
    const parsed = parseKnowledgeFile("~~~md\n### 예시 헤딩\n~~~\n\n" + GOTCHA_ENTRY, "G");
    expect(parsed.invalidHeadings).toEqual([]);
    expect(parsed.entries).toHaveLength(1);

    const adr = `---\nstatus: accepted\n---\n\n## 결정\n\n- 실제 항목\n\n\`\`\`md\n### 결정 2. 예시\n- 가짜 항목\n- 또 가짜\n\`\`\`\n`;
    expect(fragmentExists(adr, "결정-2")).toBe(false);
    expect(fragmentExists(adr, "d-1")).toBe(true);
    expect(fragmentExists(adr, "d-2")).toBe(false);
  });

  it("appendKnowledgeEvent is idempotent for an identical line", () => {
    const line = "- KNOWLEDGE 2026-01-01 invariants=none(auto) gotchas=none(auto) via=make-pr";
    const once = appendKnowledgeEvent("# S\n", line);
    expect(appendKnowledgeEvent(once, line)).toBe(once);
  });

  describe("CLI", () => {
    const entry = (id, anchors) =>
      `### ${id}: 규칙 ${id}\n> 발견: 2026-10-22 · 유형: 규칙부재 · area: 결제 · 출처: PR#1 · 코드: ${anchors}\n\n**규칙:** 본문 ${id}\n\n**왜:** 이유\n`;
    const ids = (out) => [...out.matchAll(/^(G-\d{6}-[a-z-]+): /gm)].map((match) => match[1]);

    it("brief matches directory anchors, absolute paths and directory queries; stays quiet when empty", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        writeFile(
          kpath(projectRoot, "gotchas", "결제.md"),
          gotchaFile(entry("G-261001-dir-anchor", "`src/pay`"), entry("G-261002-file-anchor", "`src/pay/api.ts`"), entry("G-261003-far-away", "`lib/other/x.ts`")),
        );
        expect(ids(knowledge(projectRoot, ["brief", "--paths", "src/pay/retry.ts"]).out)).toEqual(["G-261001-dir-anchor", "G-261002-file-anchor"]);
        const absolute = knowledge(projectRoot, ["brief", "--paths", path.join(projectRoot, "src", "pay", "retry.ts")]).out;
        expect(ids(absolute)).toEqual(["G-261001-dir-anchor", "G-261002-file-anchor"]);
        expect(ids(knowledge(projectRoot, ["brief", "--paths", "src/pay"]).out)).toEqual(["G-261001-dir-anchor", "G-261002-file-anchor"]);
        const outside = knowledge(projectRoot, ["brief", "--paths", "/etc/hosts"]);
        expect(outside.out.trim()).toBe("(관련 항목 없음)");
        expect(outside.err).toContain("저장소 밖 경로");

        const unknown = knowledge(projectRoot, ["brief", "--ids", "G-269999-gone-x"]).out;
        expect(unknown).toBe("G-269999-gone-x: (없음)\n");
        // 공백으로 나눈 ID 목록도 ID 둘로 읽힌다.
        const spaced = knowledge(projectRoot, ["brief", "--ids", "G-261001-dir-anchor", "G-261002-file-anchor"]).out;
        expect(ids(spaced)).toEqual(["G-261001-dir-anchor", "G-261002-file-anchor"]);
      });
    });

    it("retire 폐기 ignores a value-less --to instead of writing 'true'", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        addKnowledge(projectRoot);
        const result = knowledge(projectRoot, ["retire", "--id", "G-261022-retry-idempotency", "--state", "폐기", "--to", "--reason", "끝"]);
        expect(result.status).toBe(0);
        expect(read(kpath(projectRoot, "_tombstones.md"))).toContain("| G-261022-retry-idempotency | 폐기 | - | 끝 |");
      });
    });

    it("reanchor follows a rename that is staged but not committed, so the commit can pass pre-commit", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot, { commit: false });
        addKnowledge(projectRoot);
        commitAll(projectRoot, "knowledge");
        fs.mkdirSync(path.join(projectRoot, "src", "billing"), { recursive: true });
        git(projectRoot, ["mv", "src/pay/retry.ts", "src/billing/retry.ts"]);
        expect(gateLines(check(projectRoot), "K6").length).toBeGreaterThan(0);
        const preview = knowledge(projectRoot, ["reanchor"]);
        expect(preview.out).toContain("src/pay/retry.ts → src/billing/retry.ts");
        expect(knowledge(projectRoot, ["reanchor", "--apply"]).out).toContain("적용 2건");
        expect(gateLines(check(projectRoot), "K6")).toEqual([]);
      });
    });

    it("record --auto is idempotent: a unit with an event is reported as already-recorded", () => {
      withProject((projectRoot) => {
        seededProject(projectRoot);
        const unit = "docs/raw/chore/tidy";
        writeFile(path.join(projectRoot, unit, "notes.md"), "# Chore\n");
        writeFile(path.join(projectRoot, unit, "state.md"), stateFile());
        expect(knowledge(projectRoot, ["record", "--unit", unit, "--auto", "--via", "make-pr"]).out.trim()).toBe("auto: none(auto) 기록");
        expect(knowledge(projectRoot, ["record", "--unit", unit, "--auto", "--via", "make-pr"]).out.trim()).toBe("already-recorded");
        addKnowledge(projectRoot);
        const explicit = ["record", "--unit", unit, "--gotchas", "G-261022-retry-idempotency", "--invariants", "none", "--via", "feedback"];
        expect(knowledge(projectRoot, explicit).status).toBe(0);
        expect(knowledge(projectRoot, explicit).out).toContain("이미 기록됨");
        expect(parseKnowledgeEvents(read(path.join(projectRoot, unit, "state.md")))).toHaveLength(2);
      });
    });
  });

  describe("bootstrap CLI", () => {
    function smallBootstrap(projectRoot) {
      git(projectRoot, ["init", "-q"]);
      git(projectRoot, ["checkout", "-q", "-b", "main"]);
      harnessInit(projectRoot);
      const raw = (...parts) => path.join(projectRoot, "docs", "raw", ...parts);
      writeFile(raw("feature", "kor-one", "prd.md"), prdFile().replace("# PRD", `# PRD\n\n## 요구사항\n\n- ${"가나다라".repeat(500)}\n`));
      writeFile(raw("bugfix", "kor-two", "bugfix.md"), bugfixFile({ area: "알림" }));
      commitAll(projectRoot, "units");
      git(projectRoot, ["checkout", "-q", "-b", "chore/knowledge-bootstrap"]);
    }

    it("--force re-plan inherits pr_source, and a switch before the subcommand keeps the subcommand", () => {
      withProject((projectRoot) => {
        smallBootstrap(projectRoot);
        expect(knowledge(projectRoot, ["bootstrap", "plan", "--pr-source", "gh"]).status).toBe(0);
        expect(ledgerField(projectRoot, "pr_source")).toBe("gh");
        expect(knowledge(projectRoot, ["bootstrap", "--force", "plan"]).status).toBe(0);
        expect(ledgerField(projectRoot, "pr_source")).toBe("gh");
        expect(knowledge(projectRoot, ["bootstrap", "plan", "--force", "--pr-source", "none"]).status).toBe(0);
        expect(ledgerField(projectRoot, "pr_source")).toBe("none");
      });
    });

    it("next-batch rejects an area the ledger does not have instead of printing done", () => {
      withProject((projectRoot) => {
        smallBootstrap(projectRoot);
        knowledge(projectRoot, ["bootstrap", "plan"]);
        const typo = knowledge(projectRoot, ["bootstrap", "next-batch", "--area", "없는영역"]);
        expect(typo.status).toBe(1);
        expect(typo.err).toContain("원장의 영역:");
        expect(typo.out).not.toContain("done");
        expect(knowledge(projectRoot, ["bootstrap", "next-batch", "--area", "알림"]).status).toBe(0);
      });
    });

    it("next-batch truncates multibyte excerpts on a character boundary", () => {
      withProject((projectRoot) => {
        smallBootstrap(projectRoot);
        knowledge(projectRoot, ["bootstrap", "plan"]);
        const batch = knowledge(projectRoot, ["bootstrap", "next-batch", "--area", "결제", "--max-tokens", "1"]);
        expect(batch.out).toContain("(잘림");
        expect(batch.out).not.toContain("\uFFFD");
      });
    });
  });
});
