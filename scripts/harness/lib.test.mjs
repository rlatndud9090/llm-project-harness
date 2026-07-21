import { afterEach, describe, expect, it } from "vitest";
import {
  FORBIDDEN_STATUS_TRANSITIONS,
  adrBodyLooksAuthored,
  changelogEntriesAfter,
  changelogHeadId,
  datedBulletDate,
  extractH1,
  formatApprovalEvent,
  isForbiddenStageTransition,
  isForbiddenTransition,
  isPreAdrStage,
  parseApprovalEvents,
  parseAreaList,
  parseAreaSections,
  parseFrontmatter,
  parseWorkBranch,
  primaryArtifactName,
  resolveTimezone,
  sectionFileName,
  setFrontmatterField,
  skeletonAdrBody,
  stripKnownPrefix,
  titleFromSlug,
  today,
  toPosix,
} from "./lib.mjs";

describe("parseWorkBranch", () => {
  it("parses well-formed work branches", () => {
    expect(parseWorkBranch("feature/main-layout")).toEqual({ type: "feature", slug: "main-layout" });
    expect(parseWorkBranch("bugfix/duplicate-link")).toEqual({ type: "bugfix", slug: "duplicate-link" });
    expect(parseWorkBranch("chore/repo-bootstrap")).toEqual({ type: "chore", slug: "repo-bootstrap" });
  });

  it("flags vague slugs as invalid rather than valid", () => {
    const parsed = parseWorkBranch("feature/fix");
    expect(parsed?.invalid).toBeTruthy();
  });

  it("rejects malformed branch names", () => {
    expect(parseWorkBranch("main")).toBeNull();
    expect(parseWorkBranch("feature/Main-Layout")).toBeNull();
    expect(parseWorkBranch("feature/")).toBeNull();
    expect(parseWorkBranch("release/v1")).toBeNull();
  });
});

describe("parseFrontmatter", () => {
  it("extracts fields, strips quotes and trailing comments", () => {
    const fields = parseFrontmatter(
      ['---', 'title: "Sample"', "date: 2026-01-01 # inline note", "status: draft", "---", "", "# body"].join("\n"),
    );
    expect(fields).toMatchObject({ title: "Sample", date: "2026-01-01", status: "draft" });
  });

  it("returns null without a frontmatter block", () => {
    expect(parseFrontmatter("# no frontmatter here")).toBeNull();
  });
});

describe("extractH1", () => {
  it("returns the body H1, skipping a `#` comment line inside frontmatter", () => {
    // Mirrors the real kickoff template shape: frontmatter carries `# section(…)`
    // hint lines before the body's real H1.
    const content = [
      "---",
      'title: "데이터 계약"',
      "status: draft # draft | review | approved",
      "# section(섹션, 선택): area보다 큰 상위 단위. …",
      "section:",
      "# area(영역): 이 unit이 발전시키는 기능/구조 단위. …",
      "area:",
      "---",
      "",
      "# PRD: 데이터 계약",
      "",
      "## 배경",
    ].join("\n");
    expect(extractH1(content)).toBe("PRD: 데이터 계약");
  });

  it("still finds the H1 when there is no frontmatter", () => {
    expect(extractH1("# Notes: 작업 단위 제목\n\nDate: 2026-01-01\n")).toBe("Notes: 작업 단위 제목");
  });

  it("returns null when there is no body H1", () => {
    expect(extractH1('---\ntitle: "x"\n# hint: not a title\n---\n\n본문만 있고 헤딩은 없다.\n')).toBeNull();
  });
});

describe("titleFromSlug / stripKnownPrefix", () => {
  it("title-cases kebab slugs", () => {
    expect(titleFromSlug("main-layout")).toBe("Main Layout");
  });

  it("removes a known artifact prefix only", () => {
    expect(stripKnownPrefix("PRD: Daily Quiz")).toBe("Daily Quiz");
    expect(stripKnownPrefix("Daily Quiz")).toBe("Daily Quiz");
  });
});

describe("timezone-aware today()", () => {
  const original = process.env.HARNESS_TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.HARNESS_TZ;
    else process.env.HARNESS_TZ = original;
  });

  it("returns an ISO date for an explicit zone", () => {
    expect(today("Asia/Seoul")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prefers HARNESS_TZ when resolving the default zone", () => {
    process.env.HARNESS_TZ = "America/New_York";
    expect(resolveTimezone()).toBe("America/New_York");
  });

  it("falls back to a real zone when HARNESS_TZ is unset", () => {
    delete process.env.HARNESS_TZ;
    expect(typeof resolveTimezone()).toBe("string");
    expect(resolveTimezone().length).toBeGreaterThan(0);
  });
});

describe("isForbiddenTransition", () => {
  it("blocks unambiguous backward moves", () => {
    expect(isForbiddenTransition("prd.md", "approved", "draft")).toBe(true);
    expect(isForbiddenTransition("prd.md", "approved", "review")).toBe(true);
    expect(isForbiddenTransition("adr.md", "accepted", "proposed")).toBe(true);
    expect(isForbiddenTransition("adr.md", "superseded", "accepted")).toBe(true);
    expect(isForbiddenTransition("bugfix.md", "fixed", "draft")).toBe(true);
  });

  it("allows forward progress, reopening, and retiring", () => {
    expect(isForbiddenTransition("prd.md", "draft", "review")).toBe(false);
    expect(isForbiddenTransition("prd.md", "review", "approved")).toBe(false);
    expect(isForbiddenTransition("prd.md", "rejected", "draft")).toBe(false);
    expect(isForbiddenTransition("adr.md", "accepted", "superseded")).toBe(false);
    expect(isForbiddenTransition("adr.md", "accepted", "deprecated")).toBe(false);
  });

  it("ignores files without a transition policy", () => {
    expect(isForbiddenTransition("notes.md", "draft", "done")).toBe(false);
    expect(FORBIDDEN_STATUS_TRANSITIONS["notes.md"]).toBeUndefined();
    // chore is notes-only now: no status lifecycle, so no transition policy.
    expect(isForbiddenTransition("chore.md", "done", "draft")).toBe(false);
    expect(FORBIDDEN_STATUS_TRANSITIONS["chore.md"]).toBeUndefined();
  });
});

describe("toPosix", () => {
  it("keeps posix separators intact", () => {
    expect(toPosix("docs/raw/feature/x")).toBe("docs/raw/feature/x");
  });
});

describe("isForbiddenStageTransition", () => {
  it("blocks rewinding out of a post-approval stage", () => {
    expect(isForbiddenStageTransition("approved", "prd-review")).toBe(true);
    expect(isForbiddenStageTransition("implementing", "awaiting-approval")).toBe(true);
    expect(isForbiddenStageTransition("integrated", "kickoff")).toBe(true);
  });

  it("allows forward progress and post-approval rework", () => {
    expect(isForbiddenStageTransition("kickoff", "prd-review")).toBe(false);
    expect(isForbiddenStageTransition("awaiting-approval", "approved")).toBe(false);
    expect(isForbiddenStageTransition("approved", "implementing")).toBe(false);
    expect(isForbiddenStageTransition("integrated", "implementing")).toBe(false);
  });

  it("allows resuming ADR authoring after a PRD-first approval (approved -> adr phase)", () => {
    // PRD approved first, then the ADR is authored: entering the ADR phase from
    // `approved` is not an un-approval (the PRD stays approved on its own axis).
    expect(isForbiddenStageTransition("approved", "adr-draft")).toBe(false);
    expect(isForbiddenStageTransition("approved", "adr-review")).toBe(false);
    // but a true rewind of the PRD-approval process is still blocked
    expect(isForbiddenStageTransition("approved", "prd-review")).toBe(true);
    expect(isForbiddenStageTransition("approved", "awaiting-approval")).toBe(true);
  });
});

describe("setFrontmatterField", () => {
  it("replaces an existing key without touching the body", () => {
    const input = ['---', 'title: "X"', "status: review", "---", "", "# body", "status: review (in prose)"].join("\n");
    const out = setFrontmatterField(input, "status", "approved");
    expect(out).toContain("status: approved");
    expect(out).not.toContain("status: review\n");
    expect(out).toContain("# body");
    expect(out).toContain("status: review (in prose)"); // body line untouched
  });

  it("inserts a missing key into the frontmatter block", () => {
    const input = ['---', 'title: "X"', "status: approved", "---", "", "# body"].join("\n");
    const out = setFrontmatterField(input, "approval", '"user:2026-01-01:ok"');
    const fields = parseFrontmatter(out);
    expect(fields.approval).toBe("user:2026-01-01:ok");
    expect(fields.title).toBe("X");
    expect(fields.status).toBe("approved");
  });
});

describe("isPreAdrStage", () => {
  it("treats PRD-phase stages (and awaiting-approval) as pre-ADR", () => {
    for (const stage of ["kickoff", "prd-draft", "prd-review", "awaiting-approval"]) {
      expect(isPreAdrStage(stage)).toBe(true);
    }
  });

  it("treats the ADR phase and beyond as not pre-ADR", () => {
    for (const stage of ["adr-draft", "adr-review", "approved", "implementing", "integrated"]) {
      expect(isPreAdrStage(stage)).toBe(false);
    }
  });

  it("fails open (false) for an unknown or missing stage", () => {
    expect(isPreAdrStage("nonsense")).toBe(false);
    expect(isPreAdrStage(undefined)).toBe(false);
  });
});

describe("adrBodyLooksAuthored (ADR phase gate)", () => {
  const wrap = (body) => `---\ntitle: "x"\n---\n${body}`;

  it("reads the pristine kickoff skeleton as not authored", () => {
    expect(adrBodyLooksAuthored(wrap(skeletonAdrBody()))).toBe(false);
  });

  it("is title-independent (a substituted H1 does not count as authoring)", () => {
    const withTitle = skeletonAdrBody().replace("# ADR: {제목}", "# ADR: 데이터 계약");
    expect(adrBodyLooksAuthored(wrap(withTitle))).toBe(false);
  });

  it("reads a fully authored ADR as authored", () => {
    expect(adrBodyLooksAuthored(wrap("# ADR: x\n\n## 결정\n\n링크 기반 공유를 채택한다.\n"))).toBe(true);
  });

  it("reads partial authoring that leaves a template token as authored (the token-heuristic bypass)", () => {
    // The decision sections are written, but the 선택지 headers still carry {이름}.
    // A naive `contains {…}` heuristic would wrongly call this a skeleton.
    const partial = skeletonAdrBody()
      .replace("어떤 상황에서 이 결정이 필요했는가?", "PRD 요구로 링크 공유가 필요하다.")
      .replace("무엇을 결정했는가?", "링크 기반 공유를 채택한다.");
    expect(partial).toContain("{이름}");
    expect(adrBodyLooksAuthored(wrap(partial))).toBe(true);
  });

  it("does not let a removed H1 line pass as the skeleton", () => {
    // Skeleton body with only the H1 title line stripped must still differ from the
    // skeleton (canonicalizing, not dropping, the H1 closes this gap).
    const noH1 = skeletonAdrBody()
      .split("\n")
      .filter((line) => !/^#\s/.test(line.trim()))
      .join("\n");
    expect(adrBodyLooksAuthored(wrap(noH1))).toBe(true);
  });
});

describe("changelog head / delta", () => {
  const content = ["# CHANGELOG", "", "intro line", "", "## 2026-07-06 b", "b1", "", "## 2026-01-01 a", "a1", ""].join("\n");

  it("reads the newest entry id as head, or null when there are none", () => {
    expect(changelogHeadId(content)).toBe("2026-07-06 b");
    expect(changelogHeadId("# 제목만 있고 항목 없음")).toBeNull();
  });

  it("returns only entries newer than the acked id", () => {
    const after = changelogEntriesAfter(content, "2026-01-01 a");
    expect(after).toContain("## 2026-07-06 b");
    expect(after).not.toContain("## 2026-01-01 a");
  });

  it("returns all entries when the acked id is empty/unknown", () => {
    const after = changelogEntriesAfter(content, "");
    expect(after).toContain("## 2026-07-06 b");
    expect(after).toContain("## 2026-01-01 a");
  });
});

describe("parseAreaList", () => {
  it("splits a comma list, trims, and drops empties", () => {
    expect(parseAreaList("A화면, 인증 플로우")).toEqual(["A화면", "인증 플로우"]);
    expect(parseAreaList("A, , B")).toEqual(["A", "B"]);
  });

  it("treats empty/undefined/hint/token values as no declaration", () => {
    expect(parseAreaList("")).toEqual([]);
    expect(parseAreaList(undefined)).toEqual([]);
    expect(parseAreaList("# 힌트")).toEqual([]); // a leftover comment value
    expect(parseAreaList("{area}")).toEqual([]); // an unsubstituted kickoff token
  });

  it("reads a bare `area:` (with a `#` hint line above) as undeclared", () => {
    // The template keeps the hint on its own `#` line so parseFrontmatter never
    // mistakes it for the value (the inline-comment strip only fires after a value).
    const fields = parseFrontmatter(
      ["---", "title: X", "# area(영역): 이 unit의 영역", "area:", "status: review", "---", "", "# body"].join("\n"),
    );
    expect(fields.area).toBe("");
    expect(parseAreaList(fields.area)).toEqual([]);
  });
});

describe("sectionFileName", () => {
  it("keeps Korean names and appends .md", () => {
    expect(sectionFileName("대시보드")).toBe("대시보드.md");
  });

  it("turns spaces into hyphens and strips path-unsafe characters", () => {
    expect(sectionFileName("메인 레이아웃")).toBe("메인-레이아웃.md");
    expect(sectionFileName("결제/정산")).toBe("결제정산.md");
    expect(sectionFileName("대시:보드")).toBe("대시보드.md");
  });

  it("preserves existing hyphens", () => {
    expect(sectionFileName("a-b-c")).toBe("a-b-c.md");
  });

  it("returns null for an empty result or a reserved basename", () => {
    expect(sectionFileName("   ")).toBeNull();
    expect(sectionFileName("///")).toBeNull();
    expect(sectionFileName("index")).toBeNull();
    expect(sectionFileName("INDEX")).toBeNull();
    expect(sectionFileName(undefined)).toBeNull();
  });
});

describe("datedBulletDate / primaryArtifactName", () => {
  it("extracts the backtick-wrapped ISO date prefix", () => {
    expect(datedBulletDate("- `2026-01-01` **x** — [PRD](y)")).toBe("2026-01-01");
    expect(datedBulletDate("- **x** — [PRD](y)")).toBeNull();
  });

  it("maps a unit type to its area-carrying artifact", () => {
    expect(primaryArtifactName("feature")).toBe("prd.md");
    expect(primaryArtifactName("bugfix")).toBe("bugfix.md");
    expect(primaryArtifactName("chore")).toBeNull();
  });
});

describe("parseAreaSections", () => {
  const wiki = [
    "## Raw Units",
    "",
    "### A화면",
    "",
    "- `2024-03-15` **최초** — [PRD](../raw/feature/a/prd.md) · [ADR](../raw/feature/a/adr.md) _(superseded by 정렬)_",
    "- `2026-06-20` **고도화** — [PRD](../raw/feature/b/prd.md) · [ADR](../raw/feature/b/adr.md) _(현재)_",
    "",
    "### 프로젝트 운영",
    "",
    "- **버그** — [Bugfix](../raw/bugfix/x/bugfix.md)",
    "",
    "## Maintenance",
    "",
  ].join("\n");

  it("splits `### ` sections with dated bullets, links, and markers", () => {
    const sections = parseAreaSections(wiki);
    expect(sections.map((s) => s.name)).toEqual(["A화면", "프로젝트 운영"]);

    const area = sections[0];
    expect(area.isOperations).toBe(false);
    expect(area.lines).toHaveLength(2);
    expect(area.lines[0]).toMatchObject({
      date: "2024-03-15",
      primaryLink: "../raw/feature/a/prd.md",
      adrLink: "../raw/feature/a/adr.md",
      hasSuperseded: true,
      hasCurrent: false,
    });
    expect(area.lines[1]).toMatchObject({ date: "2026-06-20", hasCurrent: true, hasSuperseded: false });

    const ops = sections[1];
    expect(ops.isOperations).toBe(true);
    expect(ops.lines[0]).toMatchObject({ date: null, primaryLink: "../raw/bugfix/x/bugfix.md" });
  });

  it("stops a section at the next `##` heading (Maintenance is not a bullet)", () => {
    const sections = parseAreaSections(wiki);
    expect(sections).toHaveLength(2);
  });
});

describe("approval events", () => {
  it("round-trips a formatted approval event", () => {
    const line = formatApprovalEvent({ target: "prd", date: "2026-07-02", transport: "harness:approve", quote: "응 이대로\n승인해" });
    expect(line).toBe("- APPROVAL prd 2026-07-02 harness:approve :: 응 이대로 승인해");
    const events = parseApprovalEvents(`잡음\n${line}\n잡음`);
    expect(events).toEqual([{ target: "prd", date: "2026-07-02", transport: "harness:approve", quote: "응 이대로 승인해" }]);
  });

  it("ignores lines that are not approval events", () => {
    expect(parseApprovalEvents("- 그냥 로그\n- APPROVAL foo 2026 x :: y")).toEqual([]);
  });
});
