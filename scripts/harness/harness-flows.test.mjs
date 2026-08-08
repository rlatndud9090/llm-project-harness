import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The harness engine lives ONLY in this repo (the plugin). Tests spawn each engine
// script straight from here with cwd = a temp consumer, so REPO_ROOT resolves to the
// consumer and findHarnessRoot() resolves back to this repo — exactly the plugin
// runtime split. There is no `.harness` mount to create.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("wiki-ingest", () => {
  it("does not duplicate a unit link when ingested twice", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "sample-unit", "prd.md"),
        `${frontmatter({ title: "Sample Unit", status: "draft", unit_type: "feature" })}\n# Sample Unit\n`,
      );

      ingest(projectRoot, "docs/raw/feature/sample-unit");
      ingest(projectRoot, "docs/raw/feature/sample-unit");

      const wiki = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      const occurrences = wiki.split("](../raw/feature/sample-unit/prd.md)").length - 1;
      expect(occurrences).toBe(1);
    });
  });

  it("requires --category for feature units", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "needs-category", "prd.md"),
        `${frontmatter({ title: "Needs Category", status: "draft", unit_type: "feature" })}\n# Needs Category\n`,
      );

      const result = spawnSync(
        process.execPath,
        [path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"), "docs/raw/feature/needs-category"],
        { cwd: projectRoot, encoding: "utf8" },
      );

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("--category");
    });
  });

  it("rejects broad feature categories", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "broad-category", "prd.md"),
        `${frontmatter({ title: "Broad Category", status: "draft", unit_type: "feature" })}\n# Broad Category\n`,
      );

      const result = spawnSync(
        process.execPath,
        [
          path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"),
          "docs/raw/feature/broad-category",
          "--category",
          "Product & Architecture",
        ],
        { cwd: projectRoot, encoding: "utf8" },
      );

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("너무 넓습니다");
    });
  });

  it("creates a new feature category when the requested category does not exist yet", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "new-category", "prd.md"),
        `${frontmatter({ title: "New Category", status: "draft", unit_type: "feature" })}\n# New Category\n`,
      );

      ingest(projectRoot, "docs/raw/feature/new-category", "맞춤 기능 축");

      const wiki = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(wiki).toContain("### 맞춤 기능 축");
      expect(wiki).toContain("[PRD](../raw/feature/new-category/prd.md)");
    });
  });
});

describe("wiki-ingest area lineage", () => {
  it("groups by prd.md frontmatter area with a dated line (no --area needed)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "a-screen", "prd.md"),
        `${frontmatter({ title: "A화면 최초 구축", status: "review", unit_type: "feature", area: "A화면" })}\n# A화면 최초 구축\n`,
      );

      ingestArea(projectRoot, "docs/raw/feature/a-screen");

      const wiki = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(wiki).toContain("### A화면");
      expect(wiki).toContain("- `2026-01-01` **A화면 최초 구축** — [PRD](../raw/feature/a-screen/prd.md)");
    });
  });

  it("inserts bullets in ascending date order regardless of ingest order", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "later", "prd.md"),
        `${frontmatter({ title: "고도화", status: "review", unit_type: "feature", area: "A화면", date: "2026-06-20" })}\n# 고도화\n`,
      );
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "earlier", "prd.md"),
        `${frontmatter({ title: "최초 구축", status: "review", unit_type: "feature", area: "A화면", date: "2024-03-15" })}\n# 최초 구축\n`,
      );

      ingestArea(projectRoot, "docs/raw/feature/later");
      ingestArea(projectRoot, "docs/raw/feature/earlier");

      const wiki = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(wiki.indexOf("최초 구축")).toBeGreaterThan(-1);
      expect(wiki.indexOf("최초 구축")).toBeLessThan(wiki.indexOf("고도화"));
    });
  });

  it("links a multi-area unit under each area and stays idempotent per area", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "multi", "prd.md"),
        `${frontmatter({ title: "교차 작업", status: "review", unit_type: "feature", area: "A화면, 인증 플로우" })}\n# 교차 작업\n`,
      );

      ingestArea(projectRoot, "docs/raw/feature/multi");
      ingestArea(projectRoot, "docs/raw/feature/multi");

      const wiki = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(wiki).toContain("### A화면");
      expect(wiki).toContain("### 인증 플로우");
      const occurrences = wiki.split("](../raw/feature/multi/prd.md)").length - 1;
      expect(occurrences).toBe(2);
    });
  });

  it("prefers frontmatter area over --category and warns", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "conflict", "prd.md"),
        `${frontmatter({ title: "충돌", status: "review", unit_type: "feature", area: "진짜영역" })}\n# 충돌\n`,
      );

      const result = spawnSync(
        process.execPath,
        [path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"), "docs/raw/feature/conflict", "--category", "가짜영역"],
        { cwd: projectRoot, encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("--category 무시");
      const wiki = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(wiki).toContain("### 진짜영역");
      expect(wiki).not.toContain("### 가짜영역");
    });
  });

  it("preserves non-bullet content in an area section on re-ingest", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "note-a", { status: "review", area: "노트영역", date: "2024-01-01" });
      ingestArea(projectRoot, "docs/raw/feature/note-a");

      const wikiPath = path.join(projectRoot, "docs", "wiki", "index.md");
      writeFile(wikiPath, read(wikiPath).replace("### 노트영역\n", "### 노트영역\n\n> 설계 노트: 보존되어야 함.\n"));

      seedAreaFeature(projectRoot, "note-b", { status: "review", area: "노트영역", date: "2026-01-01" });
      ingestArea(projectRoot, "docs/raw/feature/note-b");

      expect(read(wikiPath)).toContain("설계 노트: 보존되어야 함.");
    });
  });

  it("re-syncs a drifted timeline date on re-ingest (self-heal)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "resync", { status: "review", area: "리싱크영역", date: "2026-01-01" });
      ingestArea(projectRoot, "docs/raw/feature/resync");

      seedAreaFeature(projectRoot, "resync", { status: "review", area: "리싱크영역", date: "2025-05-05" }); // corrected date
      ingestArea(projectRoot, "docs/raw/feature/resync");

      const wiki = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(wiki).toContain("`2025-05-05`");
      expect(wiki).not.toContain("`2026-01-01`");
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("re-ingesting an area-less legacy unit with no args is a no-op, not a failure", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "legacy-unit", { status: "review" }); // no area
      ingest(projectRoot, "docs/raw/feature/legacy-unit", "레거시축"); // legacy --category

      const result = spawnSync(
        process.execPath,
        [path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"), "docs/raw/feature/legacy-unit"],
        { cwd: projectRoot, encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("already linked");
    });
  });
});

describe("wiki-ingest sections", () => {
  const wiki = (projectRoot, name) => path.join(projectRoot, "docs", "wiki", name);

  it("keeps a single declared section in index.md with no section files", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "grid", { section: "대시보드", area: "그리드", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/grid");

      const files = fs.readdirSync(path.join(projectRoot, "docs", "wiki"));
      expect(files).toEqual(["index.md"]);
      const index = read(wiki(projectRoot, "index.md"));
      expect(index).toContain("### 위젯");
      expect(index).toContain("### 그리드");
      // No real section hub heading (the intro prose mentions "## 섹션" only inside
      // inline code, so match the anchored heading line, not a bare substring).
      expect(index).not.toMatch(/^## 섹션\s*$/m);
    });
  });

  it("splits into per-section files when a 2nd section appears, migrating the first section", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯", date: "2026-01-10" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-15" });
      ingestUnit(projectRoot, "docs/raw/feature/profile");

      const index = read(wiki(projectRoot, "index.md"));
      expect(index).toContain("## 섹션");
      expect(index).toContain("[대시보드](대시보드.md)");
      expect(index).toContain("[설정](설정.md)");
      // The migrated first-section lineage left index.md.
      expect(index).not.toContain("../raw/feature/widget/prd.md");

      const dashboard = read(wiki(projectRoot, "대시보드.md"));
      expect(dashboard).toContain("### 위젯");
      expect(dashboard).toContain("[PRD](../raw/feature/widget/prd.md)");

      const settings = read(wiki(projectRoot, "설정.md"));
      expect(settings).toContain("### 프로필");
      expect(settings).toContain("[PRD](../raw/feature/profile/prd.md)");
    });
  });

  it("preserves navigation labels (현재/superseded) through the split migration", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯", date: "2026-01-10" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      // Hand-add a current marker before the split.
      const indexPath = wiki(projectRoot, "index.md");
      writeFile(indexPath, read(indexPath).replace("../raw/feature/widget/prd.md)", "../raw/feature/widget/prd.md) _(현재)_"));

      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-15" });
      ingestUnit(projectRoot, "docs/raw/feature/profile");

      expect(read(wiki(projectRoot, "대시보드.md"))).toContain("_(현재)_");
    });
  });

  it("stays idempotent after a split (no duplicate links)", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");

      const dashboard = read(wiki(projectRoot, "대시보드.md"));
      expect(dashboard.split("](../raw/feature/widget/prd.md)").length - 1).toBe(1);
    });
  });

  it("adds a 3rd section file and hub link", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");
      seedAreaFeature(projectRoot, "billing", { section: "결제", area: "청구서", date: "2026-03-01" });
      ingestUnit(projectRoot, "docs/raw/feature/billing");

      expect(fs.existsSync(wiki(projectRoot, "결제.md"))).toBe(true);
      expect(read(wiki(projectRoot, "index.md"))).toContain("[결제](결제.md)");
    });
  });

  it("passes harness:check on a split project", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");

      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("refuses to ingest a section-less feature in a split project", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");

      seedAreaFeature(projectRoot, "orphan", { area: "고아", date: "2026-03-01" });
      const result = ingestUnit(projectRoot, "docs/raw/feature/orphan");
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("섹션");
    });
  });

  it("routes a section-less operations bugfix to index.md even when split", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");

      // A dependency-bump bugfix with no area/section falls back to the operations bucket.
      const bugDir = path.join(projectRoot, "docs", "raw", "bugfix", "dep-bump");
      writeFile(path.join(bugDir, "bugfix.md"), `${frontmatter({ title: "dep-bump", status: "review", unit_type: "bugfix" })}\n# Bugfix\n\n## 증상\n\nx\n\n## 원인\n\ny\n\n## 수정\n\nz\n\n## 회귀 방지\n\n- [ ] t\n`);
      const result = ingestUnit(projectRoot, "docs/raw/bugfix/dep-bump");
      expect(result.status).toBe(0);

      const index = read(wiki(projectRoot, "index.md"));
      expect(index).toContain("../raw/bugfix/dep-bump/bugfix.md");
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("check flags a unit linked in the wrong section file", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");
      const settings = wiki(projectRoot, "설정.md");
      writeFile(settings, `${read(settings)}\n### 위젯\n\n- \`2026-01-01\` **오배치** — [PRD](../raw/feature/widget/prd.md)\n`);

      const result = runCheck(projectRoot);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain("routes it to");
    });
  });

  it("check flags a stray wiki file", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "대시보드", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");
      writeFile(wiki(projectRoot, "stray.md"), "# stray\n");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain("stray.md");
    });
  });

  it("check flags a broad section name", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "widget", { section: "기능", area: "위젯" });
      seedAreaFeature(projectRoot, "profile", { section: "설정", area: "프로필", date: "2026-02-01" });
      ingestUnit(projectRoot, "docs/raw/feature/widget");
      ingestUnit(projectRoot, "docs/raw/feature/profile");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain("too broad");
    });
  });
});

describe("kickoff-window link gates (settled-gating)", () => {
  it("is green right after kickoff of a feature with a seeded area+section", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "battle-selection", "--title", "배틀 선출", "--area", "배틀 진행 · 선출 UX", "--section", "배틀"]);
      expect(k.status).toBe(0);
      // area is durably seeded into the draft prd.md ...
      const prd = read(path.join(projectRoot, "docs", "raw", "feature", "battle-selection", "prd.md"));
      expect(prd).toContain('area: "배틀 진행 · 선출 UX"');
      // ... yet the pre-review skeleton is not required to be linked, so check is green.
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("still fails a review PRD that was not ingested (link requirement is intact)", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "foo", { status: "review", area: "포영역" });
      const result = runCheck(projectRoot);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain("not linked");
    });
  });

  it("is green once the review PRD has its first ingest", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "foo", { status: "review", area: "포영역" });
      ingestUnit(projectRoot, "docs/raw/feature/foo");
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("auto-links a chore at kickoff and stays green", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "chore", "--slug", "dep-bump", "--title", "Dep bump"]);
      expect(k.status).toBe(0);
      const index = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(index).toContain("../raw/chore/dep-bump/notes.md");
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("does not phantom-split on two draft features declaring different sections", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      kickoff(projectRoot, ["--type", "feature", "--slug", "a-feat", "--title", "A", "--area", "A영역", "--section", "대시보드"]);
      kickoff(projectRoot, ["--type", "feature", "--slug", "b-feat", "--title", "B", "--area", "B영역", "--section", "설정"]);
      expect(runCheck(projectRoot).status).toBe(0);
      // Drafts declare 2 sections but neither is settled, so no split / section files.
      expect(fs.readdirSync(path.join(projectRoot, "docs", "wiki"))).toEqual(["index.md"]);
    });
  });
});

describe("artifact-check area gates", () => {
  it("fails when a declared area does not match the linked heading", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "mismatch", { status: "review" }); // no area yet
      ingest(projectRoot, "docs/raw/feature/mismatch", "카테고리A"); // legacy category
      declareArea(projectRoot, "mismatch", "다른영역"); // now declares a different area

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('declares area "다른영역" but is not linked under "### 다른영역"');
    });
  });

  it("fails a declared broad feature area", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "broad", { status: "review" });
      ingest(projectRoot, "docs/raw/feature/broad", "정상영역");
      declareArea(projectRoot, "broad", "아키텍처");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('feature area "아키텍처" is too broad');
    });
  });

  it("hard-requires an area on the active feature branch at review", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "active", { status: "review" }); // no area
      ingest(projectRoot, "docs/raw/feature/active", "활성영역");
      git(projectRoot, ["checkout", "-q", "-b", "feature/active"]);

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("must declare an area in prd.md frontmatter");
    });
  });

  it("passes the active-branch unit once it declares an area", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "active", { status: "review", area: "활성영역" });
      ingestArea(projectRoot, "docs/raw/feature/active");
      git(projectRoot, ["checkout", "-q", "-b", "feature/active"]);

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });

  it("does not require an area on main (current-branch scope)", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "onmain", { status: "review" }); // no area, stays on main
      ingest(projectRoot, "docs/raw/feature/onmain", "메인영역");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });

  it("fails when the wiki date does not match the raw frontmatter date", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "drift", { status: "review", area: "드리프트영역" });
      ingestArea(projectRoot, "docs/raw/feature/drift");

      const wikiPath = path.join(projectRoot, "docs", "wiki", "index.md");
      writeFile(wikiPath, read(wikiPath).replace("`2026-01-01`", "`2020-01-01`"));

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("does not match");
    });
  });

  it("fails when a section marks more than one current decision", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "old", { status: "review", area: "커런시영역", date: "2024-01-01" });
      seedAreaFeature(projectRoot, "new", { status: "review", area: "커런시영역", date: "2026-01-01" });
      ingestArea(projectRoot, "docs/raw/feature/old");
      ingestArea(projectRoot, "docs/raw/feature/new");

      const wikiPath = path.join(projectRoot, "docs", "wiki", "index.md");
      const marked = read(wikiPath)
        .split("\n")
        .map((entry) => (entry.startsWith("- `") ? `${entry} _(현재)_` : entry))
        .join("\n");
      writeFile(wikiPath, marked);

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("current decisions");
    });
  });

  it("passes a multi-area unit linked under each declared area", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "cross", { status: "review", area: "A화면, 인증 플로우" });
      ingestArea(projectRoot, "docs/raw/feature/cross");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });

  it("fails a multi-area unit missing a link under one declared area", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "partial", { status: "review", area: "A화면, 인증 플로우" });
      ingestArea(projectRoot, "docs/raw/feature/partial", "A화면"); // only the first area

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('declares area "인증 플로우" but is not linked under "### 인증 플로우"');
    });
  });

  it("does not mis-attribute a `## ` section's raw link to the preceding area", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "shipping", { status: "review", area: "배송" });
      ingestArea(projectRoot, "docs/raw/feature/shipping");
      seedAreaFeature(projectRoot, "paid", { status: "review", area: "결제" });

      const wikiPath = path.join(projectRoot, "docs", "wiki", "index.md");
      // Append a `## 참고` section after the 배송 lineage (the thin template has no
      // `## Maintenance` to anchor on). The paid link then lives under `## 참고`.
      writeFile(wikiPath, `${read(wikiPath).trimEnd()}\n\n## 참고\n\n- 관련: [PRD](../raw/feature/paid/prd.md)\n`);

      const result = runCheck(projectRoot);
      // The paid link lives under `## 참고`, not `### 배송`, so it must not be
      // counted as linked under 배송 (that would be a spurious grouping failure).
      expect(`${result.stdout}${result.stderr}`).not.toContain('linked under "### 배송" but does not declare');
    });
  });

  it("does not hard-require an area on a bugfix branch (bugfix area is optional)", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "raw", "bugfix", "leak-fix", "bugfix.md"),
        `${frontmatter({ title: "누수 수정", status: "review", unit_type: "bugfix" })}\n# Bugfix\n\n## 증상\n\nx\n\n## 원인\n\nx\n\n## 수정\n\nx\n\n## 회귀 방지\n\n- [ ] 회귀 테스트\n`,
      );
      ingest(projectRoot, "docs/raw/bugfix/leak-fix"); // no --category → operations bucket
      git(projectRoot, ["checkout", "-q", "-b", "bugfix/leak-fix"]);

      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("passes a legacy project with no area and dateless wiki lines", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "legacy", { status: "review" });
      writeFile(
        path.join(projectRoot, "docs", "wiki", "index.md"),
        [
          "# Wiki",
          "",
          "## Raw Units",
          "",
          "### 레거시영역",
          "",
          "- **Legacy** — [PRD](../raw/feature/legacy/prd.md) · [ADR](../raw/feature/legacy/adr.md)",
          "",
          "### 프로젝트 운영",
          "",
          "## Maintenance",
          "",
        ].join("\n"),
      );

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });
});

describe("harness plugin adoption flag", () => {
  it("harness-init writes a valid .harness.json flag and a fresh consumer passes the check", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const flag = JSON.parse(read(path.join(projectRoot, ".harness.json")));
      expect(flag.harness).toBe("llm-project-harness");
      expect(typeof flag.version).toBe("string");
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("fails harness:check when the .harness.json flag is missing", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      fs.rmSync(path.join(projectRoot, ".harness.json"), { force: true });

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(".harness.json");
    });
  });

  it("fails harness:check when the .harness.json flag is malformed JSON", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(path.join(projectRoot, ".harness.json"), "{ not valid json");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("not valid JSON");
    });
  });
});

describe("artifact-check status transitions", () => {
  it("blocks a backward transition recorded in git history (accepted -> proposed)", () => {
    withGitProject((projectRoot) => {
      seedDecisionUnit(projectRoot, "accepted", "user:2026-01-01:approved");
      regressAdrStatus(projectRoot, "proposed");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("forbidden status transition accepted -> proposed");
    });
  });

  it("allows retiring an accepted ADR (accepted -> superseded)", () => {
    withGitProject((projectRoot) => {
      seedDecisionUnit(projectRoot, "accepted", "user:2026-01-01:approved");
      regressAdrStatus(projectRoot, "superseded");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toContain("forbidden status transition");
    });
  });
});

describe("artifact-check placeholder detection", () => {
  it("fails a review PRD that still contains template placeholders", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "ph-unit");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Ph", status: "review", unit_type: "feature" })}\n# PRD\n\n## 목표\n\n- [ ] 목표 1\n`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "Ph", status: "proposed", unit_type: "feature" })}\n# ADR\n`,
      );
      ingest(projectRoot, "docs/raw/feature/ph-unit");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("template placeholder");
    });
  });

  it("passes a review PRD whose template placeholders are filled in", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "filled-unit");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Filled", status: "review", unit_type: "feature" })}\n# PRD\n\n## 배경\n\nx\n\n## 목표\n\n- [ ] 사용자가 결과를 공유할 수 있다\n\n## 비목표\n\nx\n\n## 요구사항\n\nx\n\n## 수용 기준\n\n- [ ] 관찰 가능\n`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "Filled", status: "proposed", unit_type: "feature" })}\n# ADR\n`,
      );
      ingest(projectRoot, "docs/raw/feature/filled-unit");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });

  it("fails an accepted ADR that still has an unsubstituted {이름} token", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "adr-ph");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "AdrPh", status: "draft", unit_type: "feature" })}\n# PRD\n`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "AdrPh", status: "accepted", unit_type: "feature", approval: "user:2026-01-01:ok" })}\n# ADR\n\n### 선택지 A: {이름}\n`,
      );
      ingest(projectRoot, "docs/raw/feature/adr-ph");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("{이름}");
    });
  });

  it("ignores placeholders while the unit is still a draft", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "draft-unit");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Draft", status: "draft", unit_type: "feature" })}\n# PRD\n\n- [ ] 목표 1\n`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "Draft", status: "proposed", unit_type: "feature" })}\n# ADR\n`,
      );
      ingest(projectRoot, "docs/raw/feature/draft-unit");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });
});

describe("artifact-check adr references", () => {
  it("fails when adr related_prd points to a missing file", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "ref-unit");
      writeFile(path.join(unitDir, "prd.md"), `${frontmatter({ title: "Ref", status: "draft", unit_type: "feature" })}\n# PRD\n`);
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "Ref", status: "proposed", unit_type: "feature", related_prd: "./missing.md" })}\n# ADR\n`,
      );
      ingest(projectRoot, "docs/raw/feature/ref-unit");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("related_prd points to a missing file");
    });
  });

  it("passes when adr related_prd resolves to an existing file", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "ok-ref");
      writeFile(path.join(unitDir, "prd.md"), `${frontmatter({ title: "Ok", status: "draft", unit_type: "feature" })}\n# PRD\n`);
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "Ok", status: "proposed", unit_type: "feature", related_prd: "./prd.md" })}\n# ADR\n`,
      );
      ingest(projectRoot, "docs/raw/feature/ok-ref");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });
});

describe("artifact-check adr body immutability", () => {
  it("blocks editing an accepted ADR body recorded in git history", () => {
    withGitProject((projectRoot) => {
      seedDecisionUnit(projectRoot, "accepted", "user:2026-01-01:approved");
      const adrPath = path.join(projectRoot, "docs", "raw", "feature", "decision", "adr.md");
      writeFile(
        adrPath,
        `${frontmatter({ title: "Decision", status: "accepted", unit_type: "feature", approval: "user:2026-01-01:approved" })}\n# Decision\n\n## 결정\n\n원래 결정을 다른 내용으로 재작성한다.\n`,
      );

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("ADR body must not change");
    });
  });

  it("allows changing only status on an accepted ADR (retire to superseded)", () => {
    withGitProject((projectRoot) => {
      seedDecisionUnit(projectRoot, "accepted", "user:2026-01-01:approved");
      regressAdrStatus(projectRoot, "superseded");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });
});

describe("verify-commit-msg", () => {
  it("rejects a commit message without a 관련 문서 block", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const msgPath = path.join(projectRoot, "COMMIT_MSG.txt");
      writeFile(msgPath, "feat: do a thing\n\n맥락 설명.\n");
      const result = runVerifyMsg(projectRoot, msgPath);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("관련 문서");
    });
  });

  it("accepts a commit message with a 관련 문서 block and link", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const msgPath = path.join(projectRoot, "COMMIT_MSG.txt");
      writeFile(msgPath, "feat: do a thing\n\n맥락.\n\n관련 문서:\n[PRD](docs/raw/feature/x/prd.md)\n");
      const result = runVerifyMsg(projectRoot, msgPath);
      expect(result.status).toBe(0);
    });
  });

  it("skips auto-generated merge commits", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const msgPath = path.join(projectRoot, "COMMIT_MSG.txt");
      writeFile(msgPath, "Merge branch 'main' into feature/x\n");
      const result = runVerifyMsg(projectRoot, msgPath);
      expect(result.status).toBe(0);
    });
  });
});

describe("install-hooks", () => {
  it("installs pre-commit and commit-msg hooks", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      execFileSync(process.execPath, [path.join(repoRoot, "scripts", "harness", "install-hooks.mjs")], {
        cwd: projectRoot,
        encoding: "utf8",
      });
      expect(fs.existsSync(path.join(projectRoot, ".git", "hooks", "pre-commit"))).toBe(true);
      const commitMsgHook = path.join(projectRoot, ".git", "hooks", "commit-msg");
      expect(fs.existsSync(commitMsgHook)).toBe(true);
      expect(read(commitMsgHook)).toContain("verify-commit-msg.mjs");
    });
  });
});

describe("harness-init (plugin bootstrap)", () => {
  it("merges .claude/settings.json additively, preserving unrelated keys", () => {
    withProject((projectRoot) => {
      writeFile(
        path.join(projectRoot, ".claude", "settings.json"),
        `${JSON.stringify({ model: "opus", permissions: { allow: ["Bash"] } }, null, 2)}\n`,
      );

      harnessInit(projectRoot);

      const settings = JSON.parse(read(path.join(projectRoot, ".claude", "settings.json")));
      // pre-existing keys preserved
      expect(settings.model).toBe("opus");
      expect(settings.permissions).toEqual({ allow: ["Bash"] });
      // plugin wiring added
      expect(settings.enabledPlugins["llm-project-harness"]).toBe(true);
      expect(settings.extraKnownMarketplaces["llm-project-harness"]).toEqual({
        source: { source: "github", repo: "rlatndud9090/llm-project-harness" },
      });
    });
  });

  it("scaffolds docs only when absent (retrofit preserves a local AGENTS.md)", () => {
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, "AGENTS.md"), "# 우리 프로젝트\n\n로컬 내용 보존.\n");

      harnessInit(projectRoot);

      const agents = read(path.join(projectRoot, "AGENTS.md"));
      expect(agents).toContain("로컬 내용 보존.");
      // absent docs are still scaffolded
      expect(fs.existsSync(path.join(projectRoot, "docs", "wiki", "index.md"))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, "docs", "raw", "README.md"))).toBe(true);
    });
  });

  it("is idempotent: a second run keeps a passing check", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      harnessInit(projectRoot);
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("migrates an old install: removes the .harness symlink and strips devDep/postinstall", () => {
    withProject((projectRoot) => {
      // Simulate a legacy devDependency/submodule consumer.
      fs.symlinkSync(repoRoot, path.join(projectRoot, ".harness"), "dir");
      writeFile(
        path.join(projectRoot, "package.json"),
        `${JSON.stringify(
          {
            name: "legacy-consumer",
            devDependencies: { "llm-project-harness": "github:rlatndud9090/llm-project-harness#v1.0.0" },
            scripts: {
              postinstall: "node node_modules/llm-project-harness/scripts/harness/link.mjs || true",
              build: "echo build",
            },
          },
          null,
          2,
        )}\n`,
      );
      writeFile(path.join(projectRoot, ".harness-sync"), "2020-01-01 old-entry\n");

      harnessInit(projectRoot);

      // the old mount and sync marker are gone
      expect(fs.existsSync(path.join(projectRoot, ".harness"))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, ".harness-sync"))).toBe(false);
      // package.json: harness devDep + link.mjs postinstall stripped, other scripts kept
      const pkg = JSON.parse(read(path.join(projectRoot, "package.json")));
      expect(pkg.devDependencies?.["llm-project-harness"]).toBeUndefined();
      expect(pkg.scripts?.postinstall).toBeUndefined();
      expect(pkg.scripts?.build).toBe("echo build");
      // and the freshly migrated consumer passes the check
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("installs git hooks baking the plugin's absolute engine path (no CLAUDE_PLUGIN_ROOT needed)", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot, []); // enable hooks

      const preCommit = path.join(projectRoot, ".git", "hooks", "pre-commit");
      const commitMsg = path.join(projectRoot, ".git", "hooks", "commit-msg");
      expect(fs.existsSync(preCommit)).toBe(true);
      expect(fs.existsSync(commitMsg)).toBe(true);
      // the hook body must carry the resolved plugin path, not an unresolved token
      expect(read(preCommit)).toContain(path.join(repoRoot, "scripts", "harness", "artifact-check.mjs"));
      expect(read(commitMsg)).toContain("verify-commit-msg.mjs");
      expect(read(preCommit)).not.toContain("CLAUDE_PLUGIN_ROOT");
    });
  });
});

describe("artifact-check required sections", () => {
  it("fails a review PRD missing required sections", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "sec-prd");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Sec", status: "review", unit_type: "feature" })}\n# PRD\n\n## 목표\n\n- [ ] 사용자가 결과를 본다\n`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "Sec", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      ingest(projectRoot, "docs/raw/feature/sec-prd");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("missing required section");
    });
  });

  it("passes a review PRD with all required sections", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "full-prd");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Full", status: "review", unit_type: "feature" })}\n# PRD\n\n## 배경\n\nx\n\n## 목표\n\n- [ ] 사용자가 결과를 본다\n\n## 비목표\n\nx\n\n## 요구사항\n\nx\n\n## 수용 기준\n\n- [ ] 관찰 가능\n`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "Full", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      ingest(projectRoot, "docs/raw/feature/full-prd");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });

  it("fails an accepted ADR missing required sections", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "sec-adr");
      writeFile(path.join(unitDir, "prd.md"), `${frontmatter({ title: "SecAdr", status: "draft", unit_type: "feature" })}\n# PRD\n`);
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "SecAdr", status: "accepted", unit_type: "feature", approval: "user:2026-01-01:ok" })}\n# ADR\n\n## 컨텍스트\n\nx\n`,
      );
      ingest(projectRoot, "docs/raw/feature/sec-adr");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("missing required section");
    });
  });
});

describe("artifact-check wiki taxonomy", () => {
  it("fails when feature wiki taxonomy uses a broad bucket", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "wiki", "index.md"),
        `# Project Wiki Index

## Raw Units

### Product & Architecture

- **Taxonomy** — [PRD](../raw/feature/taxonomy/prd.md)

### 프로젝트 운영

## Maintenance
`,
      );
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "taxonomy", "prd.md"),
        `${frontmatter({ title: "Taxonomy", status: "draft", unit_type: "feature" })}\n# Taxonomy\n`,
      );
      writeFile(
        path.join(projectRoot, "docs", "raw", "feature", "taxonomy", "adr.md"),
        `${frontmatter({ title: "Taxonomy", status: "proposed", unit_type: "feature" })}\n# Taxonomy\n`,
      );

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('broad wiki category "Product & Architecture"');
    });
  });
});

describe("artifact-check wiki authoring-guidance leak", () => {
  it("passes the thin attached template (only direction + Raw Units heading)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      // The freshly attached wiki is the thin template — no authoring guidance.
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("fails when the wiki still carries the old Maintenance rules block", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "wiki", "index.md"),
        [
          "# Wiki",
          "",
          "## 큰 방향성",
          "",
          "- **무엇**: 테스트 프로젝트",
          "",
          "## Raw Units (영역별 계보)",
          "",
          "## Maintenance",
          "",
          "- 새 raw work unit은 `docs/raw/{feature,bugfix,chore}/branch-slug/` 아래에 둔다.",
          "",
        ].join("\n"),
      );

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("위키 '작성 규칙' 안내문");
    });
  });

  it("fails when the wiki still carries the top authoring blockquote", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      writeFile(
        path.join(projectRoot, "docs", "wiki", "index.md"),
        [
          "# Wiki",
          "",
          "> 이 한 장은 에이전트가 작업 시작 시 로드하는 얇은 네비게이션 인덱스다.",
          "",
          "## 큰 방향성",
          "",
          "- **무엇**: 테스트",
          "",
          "## Raw Units (영역별 계보)",
          "",
        ].join("\n"),
      );

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("wiki-ingest.md");
    });
  });

  it("passes a clean project wiki that keeps direction and lineage only", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "clean", { status: "review", area: "깨끗한영역" });
      ingestArea(projectRoot, "docs/raw/feature/clean");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toContain("위키 '작성 규칙' 안내문");
    });
  });
});

describe("artifact-check bugfix required sections", () => {
  it("fails a review bugfix.md missing required sections", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "bugfix", "sec-bug");
      writeFile(
        path.join(unitDir, "bugfix.md"),
        `${frontmatter({ title: "Bug", status: "review", unit_type: "bugfix" })}\n# Bugfix\n\n## 증상\n\n실패한다.\n`,
      );
      ingest(projectRoot, "docs/raw/bugfix/sec-bug");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("missing required section");
    });
  });

  it("passes a review bugfix.md with symptom/cause/fix/regression sections", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "bugfix", "ok-bug");
      writeFile(
        path.join(unitDir, "bugfix.md"),
        `${frontmatter({ title: "Bug", status: "review", unit_type: "bugfix" })}\n# Bugfix\n\n## 증상\n\n세션 복원이 실패한다.\n\n## 원인\n\n키 계산이 어긋난다.\n\n## 수정\n\n키 계산을 고친다.\n\n## 회귀 방지\n\n- [ ] 복원 회귀 테스트를 추가한다\n`,
      );
      ingest(projectRoot, "docs/raw/bugfix/ok-bug");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });

  it("fails a fixed bugfix.md that still has the template regression placeholder", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "bugfix", "ph-bug");
      writeFile(
        path.join(unitDir, "bugfix.md"),
        `${frontmatter({ title: "Bug", status: "fixed", unit_type: "bugfix" })}\n# Bugfix\n\n## 증상\n\nx\n\n## 원인\n\nx\n\n## 수정\n\nx\n\n## 회귀 방지\n\n- [ ] 재발을 막는 테스트 또는 검증.\n`,
      );
      ingest(projectRoot, "docs/raw/bugfix/ph-bug");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("template placeholder");
    });
  });
});

describe("artifact-check chore is notes-only", () => {
  it("does not status-check a chore unit (notes.md carries no lifecycle)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      // A chore unit's notes.md can hold arbitrary frontmatter; it is not gated.
      writeFile(
        path.join(projectRoot, "docs", "raw", "chore", "tidy", "notes.md"),
        `${frontmatter({ title: "Tidy", status: "whatever", unit_type: "chore" })}\n# Chore\n`,
      );
      ingest(projectRoot, "docs/raw/chore/tidy");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });
});

describe("state ledger approval gate", () => {
  it("kickoff creates a state.md checkpoint at stage kickoff", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      runKickoff(projectRoot, "feature", "ledger-init", "원장 초기화");
      const state = read(path.join(projectRoot, "docs", "raw", "feature", "ledger-init", "state.md"));
      expect(state).toContain("stage: kickoff");
      expect(state).toContain("prd_status: draft");
      expect(state).toContain("## 승인 이벤트");
    });
  });

  it("harness:approve pre-approves a review PRD (and ADR), then --final approves; both pass harness:check", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "share");
      runKickoff(projectRoot, "feature", "share", "결과 공유");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Share", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "Share", status: "proposed", unit_type: "feature", related_prd: "./prd.md" })}\n${fullAdrBody()}`,
      );
      ingest(projectRoot, "docs/raw/feature/share", "공유 기능");

      // Tier 1: pre-approval (build-entry gate).
      const pre = runApprove(projectRoot, "docs/raw/feature/share", ["--quote", "그래 이 PRD랑 ADR 사전 승인할게, 구현 진행해", "--adr"]);
      expect(pre.status).toBe(0);

      let prd = read(path.join(unitDir, "prd.md"));
      let adr = read(path.join(unitDir, "adr.md"));
      let state = read(path.join(unitDir, "state.md"));
      expect(prd).toContain("status: pre-approved");
      expect(adr).toContain("status: pre-accepted");
      expect(state).toContain("stage: pre-approved");
      expect(state).toContain("- PREAPPROVAL prd 20");
      expect(state).toContain("- PREAPPROVAL adr 20");
      expect(state).toContain("그래 이 PRD랑 ADR 사전 승인할게, 구현 진행해");
      expect(runCheck(projectRoot).status).toBe(0);

      // Tier 2: final approval (stamped at make-pr).
      const fin = runApprove(projectRoot, "docs/raw/feature/share", ["--quote", "좋아, 이대로 최종 확정하고 PR 올려", "--final", "--adr"]);
      expect(fin.status).toBe(0);

      prd = read(path.join(unitDir, "prd.md"));
      adr = read(path.join(unitDir, "adr.md"));
      state = read(path.join(unitDir, "state.md"));
      expect(prd).toContain("status: approved");
      expect(adr).toContain("status: accepted");
      expect(state).toContain("stage: approved");
      expect(state).toContain("- APPROVAL prd 20");
      expect(state).toContain("- APPROVAL adr 20");
      expect(state).toContain("좋아, 이대로 최종 확정하고 PR 올려");
      // The PREAPPROVAL evidence is preserved alongside the final APPROVAL.
      expect(state).toContain("- PREAPPROVAL prd 20");
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("harness:approve refuses a PRD that is not in review", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      runKickoff(projectRoot, "feature", "early", "이른 승인");
      const approve = runApprove(projectRoot, "docs/raw/feature/early", ["--quote", "승인"]);
      expect(approve.status).not.toBe(0);
      expect(`${approve.stdout}${approve.stderr}`).toContain("review");
    });
  });

  it("harness:approve refuses --transport make-pr without --final (final-only label)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "mptransport");
      runKickoff(projectRoot, "feature", "mptransport", "make-pr transport 가드");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "MpTransport", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      const approve = runApprove(projectRoot, "docs/raw/feature/mptransport", ["--quote", "그래 사전 승인할게", "--transport", "make-pr"]);
      expect(approve.status).not.toBe(0);
      expect(`${approve.stdout}${approve.stderr}`).toContain("make-pr");
    });
  });

  it("harness:approve refuses without a --quote", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "noquote");
      runKickoff(projectRoot, "feature", "noquote", "인용 없음");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "NoQuote", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      const approve = runApprove(projectRoot, "docs/raw/feature/noquote", []);
      expect(approve.status).not.toBe(0);
      expect(`${approve.stdout}${approve.stderr}`).toContain("quote");
    });
  });

  it("harness:approve refuses the canned example quote", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "canned");
      runKickoff(projectRoot, "feature", "canned", "예시 인용");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Canned", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      const approve = runApprove(projectRoot, "docs/raw/feature/canned", ["--quote", "응 이대로 승인, 구현 들어가"]);
      expect(approve.status).not.toBe(0);
      expect(`${approve.stdout}${approve.stderr}`).toContain("template/example");
    });
  });

  it("harness:approve refuses a future --date", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "future");
      runKickoff(projectRoot, "feature", "future", "미래 날짜");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Future", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      const approve = runApprove(projectRoot, "docs/raw/feature/future", ["--quote", "그래 승인할게", "--date", "2999-12-31"]);
      expect(approve.status).not.toBe(0);
      expect(`${approve.stdout}${approve.stderr}`).toContain("future");
    });
  });

  it("fails harness:check when a PRD is approved with no approval event in state.md", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "forged");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Forged", status: "approved", unit_type: "feature", approval: "user:2026-01-01:사용자 승인함" })}\n${fullPrdBody()}`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "Forged", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      // Mirror says approved, but there is no recorded APPROVAL event to back it.
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({ stage: "approved", prd_status: "approved", adr_status: "proposed", approvals: [] }),
      );
      ingest(projectRoot, "docs/raw/feature/forged", "공유 기능");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("no matching APPROVAL event");
    });
  });

  it("fails harness:check when prd.md is approved but state.md was left behind (mirror mismatch)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "mismatch");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Mismatch", status: "approved", unit_type: "feature", approval: "user:2026-01-01:사용자 승인함" })}\n${fullPrdBody()}`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "Mismatch", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({ stage: "prd-review", prd_status: "review", adr_status: "proposed", approvals: [] }),
      );
      ingest(projectRoot, "docs/raw/feature/mismatch", "공유 기능");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("disagrees with prd.md status");
    });
  });

  it("requires a state.md ledger for an approved PRD", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "no-state");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "NoState", status: "approved", unit_type: "feature", approval: "user:2026-01-01:사용자 승인함" })}\n${fullPrdBody()}`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "NoState", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      ingest(projectRoot, "docs/raw/feature/no-state", "공유 기능");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("approved PRD requires a state.md ledger");
    });
  });

  it("blocks a backward stage regression recorded in git history", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "regress");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Regress", status: "approved", unit_type: "feature", approval: "user:2026-01-01:사용자 승인함" })}\n${fullPrdBody()}`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "Regress", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({ stage: "approved", prd_status: "approved", adr_status: "proposed", approvals: [{ target: "prd", quote: "승인" }] }),
      );
      ingest(projectRoot, "docs/raw/feature/regress", "공유 기능");
      commitAll(projectRoot);

      // Rewind the checkpoint out of the approved stage while the PRD stays approved.
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({ stage: "prd-review", prd_status: "approved", adr_status: "proposed", approvals: [{ target: "prd", quote: "승인" }] }),
      );

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("forbidden stage regression approved -> prd-review");
    });
  });
});

describe("artifact-check ADR phase gate (step separation)", () => {
  it("fails when adr.md is authored while the unit is still in the PRD phase", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "leak");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Leak", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "Leak", status: "proposed", unit_type: "feature", related_prd: "./prd.md" })}\n${fullAdrBody()}`,
      );
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({ stage: "prd-review", prd_status: "review", adr_status: "proposed", approvals: [] }),
      );
      ingest(projectRoot, "docs/raw/feature/leak", "공유 기능");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("ADR authored during the PRD phase");
    });
  });

  it("passes when adr.md is left exactly as the real kickoff skeleton during the PRD phase", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      // Use the REAL kickoff output so the gate is anchored to the actual template,
      // not a hand-built stand-in (guards against template/heuristic drift).
      runKickoff(projectRoot, "feature", "skeleton", "스켈레톤");
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "skeleton");
      // PRD advances to review; adr.md is left untouched as kickoff generated it.
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "Skeleton", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      const statePath = path.join(unitDir, "state.md");
      writeFile(statePath, read(statePath).replace("stage: kickoff", "stage: prd-review").replace("prd_status: draft", "prd_status: review"));
      ingest(projectRoot, "docs/raw/feature/skeleton", "공유 기능");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });

  it("allows authoring adr.md once the unit has entered the ADR phase (stage adr-draft)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "adr-phase");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "AdrPhase", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "AdrPhase", status: "proposed", unit_type: "feature", related_prd: "./prd.md" })}\n${fullAdrBody()}`,
      );
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({ stage: "adr-draft", prd_status: "review", adr_status: "proposed", approvals: [] }),
      );
      ingest(projectRoot, "docs/raw/feature/adr-phase", "공유 기능");

      const result = runCheck(projectRoot);
      expect(result.status).toBe(0);
    });
  });
});

describe("two-tier approval gate (pre-approval / --final)", () => {
  it("harness:approve --final refuses a PRD that was never pre-approved", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "skipfinal");
      runKickoff(projectRoot, "feature", "skipfinal", "사전 없이 최종");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "SkipFinal", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      const fin = runApprove(projectRoot, "docs/raw/feature/skipfinal", ["--quote", "바로 최종 확정할게", "--final"]);
      expect(fin.status).not.toBe(0);
      expect(`${fin.stdout}${fin.stderr}`).toContain("pre-approved");
    });
  });

  it("harness:check fails a pre-approved PRD with no PREAPPROVAL event", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "forgedpre");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "ForgedPre", status: "pre-approved", unit_type: "feature", approval: "user:2026-01-01:사전 승인함" })}\n${fullPrdBody()}`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "ForgedPre", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      // Mirror says pre-approved, but no PREAPPROVAL event backs it.
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({ stage: "pre-approved", prd_status: "pre-approved", adr_status: "proposed", approvals: [] }),
      );
      ingest(projectRoot, "docs/raw/feature/forgedpre");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("no matching PREAPPROVAL event");
    });
  });

  it("harness:check passes a pre-approved PRD at stage implementing (build tier)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "buildok");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "BuildOk", status: "pre-approved", unit_type: "feature", approval: "user:2026-01-01:사전 승인함" })}\n${fullPrdBody()}`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "BuildOk", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({
          stage: "implementing",
          prd_status: "pre-approved",
          adr_status: "proposed",
          approvals: [{ kind: "PREAPPROVAL", target: "prd", quote: "이대로 구현 진행" }],
        }),
      );
      ingest(projectRoot, "docs/raw/feature/buildok");

      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("harness:check fails when stage is approved but the PRD is only pre-approved", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "finalstage");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "FinalStage", status: "pre-approved", unit_type: "feature", approval: "user:2026-01-01:사전 승인함" })}\n${fullPrdBody()}`,
      );
      writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "FinalStage", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({
          stage: "approved",
          prd_status: "pre-approved",
          adr_status: "proposed",
          approvals: [{ kind: "PREAPPROVAL", target: "prd", quote: "사전 승인함" }],
        }),
      );
      ingest(projectRoot, "docs/raw/feature/finalstage");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("fully approved PRD");
    });
  });

  it("harness:check fails when a final stage ships an ADR still at pre-accepted", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "strandedadr");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "StrandedAdr", status: "approved", unit_type: "feature", approval: "user:2026-01-01:최종 확정" })}\n${fullPrdBody()}`,
      );
      writeFile(
        path.join(unitDir, "adr.md"),
        `${frontmatter({ title: "StrandedAdr", status: "pre-accepted", unit_type: "feature", related_prd: "./prd.md", approval: "user:2026-01-01:ADR 사전 승인" })}\n${fullAdrBody()}`,
      );
      writeFile(
        path.join(unitDir, "state.md"),
        stateLedger({
          stage: "approved",
          prd_status: "approved",
          adr_status: "pre-accepted",
          approvals: [
            { kind: "APPROVAL", target: "prd", quote: "최종 확정함" },
            { kind: "PREAPPROVAL", target: "adr", quote: "ADR 사전 승인함" },
          ],
        }),
      );
      ingest(projectRoot, "docs/raw/feature/strandedadr");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("still pre-accepted");
    });
  });
});

describe("claude-approval-guard", () => {
  it("blocks an Edit that flips prd.md status to approved", () => {
    const result = runGuard({
      tool_name: "Edit",
      tool_input: { file_path: "docs/raw/feature/x/prd.md", old_string: "status: review", new_string: "status: approved" },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("harness:approve");
  });

  it("blocks a Write that sets adr.md status to accepted", () => {
    const result = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/abs/docs/raw/feature/x/adr.md", content: "---\nstatus: accepted\n---\n# ADR\n" },
    });
    expect(result.status).toBe(2);
  });

  it("allows an ordinary body edit to prd.md", () => {
    const result = runGuard({
      tool_name: "Edit",
      tool_input: { file_path: "docs/raw/feature/x/prd.md", old_string: "a", new_string: "## 배경\n\n내용" },
    });
    expect(result.status).toBe(0);
  });

  it("blocks an Edit that flips prd.md status to pre-approved (build-entry tier)", () => {
    const result = runGuard({
      tool_name: "Edit",
      tool_input: { file_path: "docs/raw/feature/x/prd.md", old_string: "status: review", new_string: "status: pre-approved" },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("harness:approve");
  });

  it("blocks a Write that sets adr.md status to pre-accepted", () => {
    const result = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/abs/docs/raw/feature/x/adr.md", content: "---\nstatus: pre-accepted\n---\n# ADR\n" },
    });
    expect(result.status).toBe(2);
  });

  it("allows a body edit to an already pre-approved prd.md (mid-build revision)", () => {
    withProject((projectRoot) => {
      const prdPath = path.join(projectRoot, "docs", "raw", "feature", "rev", "prd.md");
      writeFile(
        prdPath,
        `${frontmatter({ title: "Rev", status: "pre-approved", unit_type: "feature", approval: "user:2026-01-01:사전 승인" })}\n# PRD\n\n## 요구사항\n\n- [ ] 기존 요구\n`,
      );
      const result = runGuard({
        tool_name: "Edit",
        tool_input: { file_path: prdPath, old_string: "- [ ] 기존 요구", new_string: "- [ ] 기존 요구\n- [ ] 사용자 확인 후 추가된 요구" },
      });
      expect(result.status).toBe(0);
    });
  });

  it("blocks an Edit that hand-adds a PREAPPROVAL event to state.md", () => {
    const result = runGuard({
      tool_name: "Edit",
      tool_input: {
        file_path: "docs/raw/feature/x/state.md",
        old_string: "(아직 사전 승인 없음 — 빌드 진입 불가)",
        new_string: "- PREAPPROVAL prd 2026-07-29 harness:approve :: 위조",
      },
    });
    expect(result.status).toBe(2);
  });

  it("ignores files that are not prd.md/adr.md", () => {
    const result = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "docs/raw/feature/x/notes.md", content: "status: approved" },
    });
    expect(result.status).toBe(0);
  });

  it("blocks a value-only Edit that turns review into approved (reconstructs the file)", () => {
    withProject((projectRoot) => {
      const prdPath = path.join(projectRoot, "docs", "raw", "feature", "vo", "prd.md");
      writeFile(prdPath, `${frontmatter({ title: "VO", status: "review", unit_type: "feature" })}\n# PRD\n`);
      const result = runGuard({ tool_name: "Edit", tool_input: { file_path: prdPath, old_string: "review", new_string: "approved" } });
      expect(result.status).toBe(2);
    });
  });

  it("blocks a status flip regardless of filename case (PRD.md)", () => {
    const result = runGuard({
      tool_name: "Edit",
      tool_input: { file_path: "docs/raw/feature/x/PRD.md", old_string: "status: review", new_string: "status: approved" },
    });
    expect(result.status).toBe(2);
  });

  it("blocks a MultiEdit that splits the status flip across edits", () => {
    withProject((projectRoot) => {
      const prdPath = path.join(projectRoot, "docs", "raw", "feature", "me", "prd.md");
      writeFile(prdPath, `${frontmatter({ title: "ME", status: "review", unit_type: "feature" })}\n# PRD\n`);
      const result = runGuard({
        tool_name: "MultiEdit",
        tool_input: {
          file_path: prdPath,
          edits: [
            { old_string: "status: review", new_string: "status: " },
            { old_string: "status: ", new_string: "status: approved" },
          ],
        },
      });
      expect(result.status).toBe(2);
    });
  });

  it("blocks hand-writing an approval into state.md", () => {
    withProject((projectRoot) => {
      const statePath = path.join(projectRoot, "docs", "raw", "feature", "st", "state.md");
      writeFile(statePath, `${frontmatter({ title: "St", stage: "prd-review", prd_status: "review", adr_status: "proposed" })}\n# 원장\n`);
      const result = runGuard({
        tool_name: "Edit",
        tool_input: { file_path: statePath, old_string: "prd_status: review", new_string: "prd_status: approved" },
      });
      expect(result.status).toBe(2);
    });
  });

  it("allows advancing state.md stage to implementing on an already-approved unit", () => {
    withProject((projectRoot) => {
      const statePath = path.join(projectRoot, "docs", "raw", "feature", "impl", "state.md");
      writeFile(statePath, `${frontmatter({ title: "Impl", stage: "approved", prd_status: "approved", adr_status: "proposed" })}\n# 원장\n`);
      const result = runGuard({
        tool_name: "Edit",
        tool_input: { file_path: statePath, old_string: "stage: approved", new_string: "stage: implementing" },
      });
      expect(result.status).toBe(0);
    });
  });

  it("blocks an adr.md edit while the unit is still in the PRD phase (stage prd-review)", () => {
    withProject((projectRoot) => {
      const statePath = path.join(projectRoot, "docs", "raw", "feature", "gate", "state.md");
      writeFile(statePath, `${frontmatter({ title: "Gate", stage: "prd-review", prd_status: "review", adr_status: "proposed" })}\n# 원장\n`);
      const adrPath = path.join(projectRoot, "docs", "raw", "feature", "gate", "adr.md");
      writeFile(adrPath, `${frontmatter({ title: "Gate", status: "proposed", unit_type: "feature" })}\n# ADR\n\n### 선택지 A: {이름}\n`);
      const result = runGuard({
        tool_name: "Edit",
        tool_input: { file_path: adrPath, old_string: "### 선택지 A: {이름}", new_string: "### 선택지 A: 링크 공유\n\n- 장점: 단순" },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("adr-draft");
    });
  });

  it("allows an adr.md edit once the unit has entered the ADR phase (stage adr-draft)", () => {
    withProject((projectRoot) => {
      const statePath = path.join(projectRoot, "docs", "raw", "feature", "gate2", "state.md");
      writeFile(statePath, `${frontmatter({ title: "Gate2", stage: "adr-draft", prd_status: "review", adr_status: "proposed" })}\n# 원장\n`);
      const adrPath = path.join(projectRoot, "docs", "raw", "feature", "gate2", "adr.md");
      writeFile(adrPath, `${frontmatter({ title: "Gate2", status: "proposed", unit_type: "feature" })}\n# ADR\n\n### 선택지 A: {이름}\n`);
      const result = runGuard({
        tool_name: "Edit",
        tool_input: { file_path: adrPath, old_string: "### 선택지 A: {이름}", new_string: "### 선택지 A: 링크 공유" },
      });
      expect(result.status).toBe(0);
    });
  });
});

function seedDecisionUnit(projectRoot, adrStatus, adrApproval) {
  harnessInit(projectRoot);
  const unitDir = path.join(projectRoot, "docs", "raw", "feature", "decision");
  writeFile(path.join(unitDir, "prd.md"), `${frontmatter({ title: "Decision", status: "draft", unit_type: "feature" })}\n# Decision\n`);
  writeFile(
    path.join(unitDir, "adr.md"),
    `${frontmatter({ title: "Decision", status: adrStatus, unit_type: "feature", approval: adrApproval })}\n# Decision\n`,
  );
  writeFile(
    path.join(unitDir, "state.md"),
    stateLedger({
      stage: "adr-review",
      prd_status: "draft",
      adr_status: adrStatus,
      approvals: adrStatus === "accepted" ? [{ target: "adr", quote: "approved" }] : [],
    }),
  );
  ingest(projectRoot, "docs/raw/feature/decision");
  commitAll(projectRoot);
}

function regressAdrStatus(projectRoot, status) {
  const unitDir = path.join(projectRoot, "docs", "raw", "feature", "decision");
  // superseded/deprecated keep no approval requirement; proposed has none either.
  // Keep state.md's mirror in step with the new status so this isolates the
  // adr.md status-transition rule under test.
  writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: "Decision", status, unit_type: "feature" })}\n# Decision\n`);
  writeFile(
    path.join(unitDir, "state.md"),
    stateLedger({ stage: "adr-review", prd_status: "draft", adr_status: status, approvals: [] }),
  );
}

// Builds a state.md ledger string. Callers keep the mirror (prd_status/adr_status)
// and approval events consistent with the prd.md/adr.md they write alongside.
function stateLedger({ stage, prd_status, adr_status, approvals = [] }) {
  const lines = ["---", 'title: "Ledger"', "date: 2026-01-01", `stage: ${stage}`];
  if (prd_status) lines.push(`prd_status: ${prd_status}`);
  if (adr_status) lines.push(`adr_status: ${adr_status}`);
  lines.push("---");
  const events = approvals.map((a) => `- ${a.kind ?? "APPROVAL"} ${a.target} ${a.date ?? "2026-01-01"} harness:approve :: ${a.quote}`);
  const eventsBlock = events.length ? events.join("\n") : "(아직 사전 승인 없음 — 빌드 진입 불가)";
  return `${lines.join("\n")}\n\n# 원장\n\n## 단계 로그 (append-only)\n\n- 2026-01-01 kickoff\n\n## 승인 이벤트\n\n${eventsBlock}\n`;
}

function fullPrdBody() {
  return [
    "# PRD",
    "",
    "## 배경",
    "",
    "결과를 외부와 공유할 방법이 없다.",
    "",
    "## 목표",
    "",
    "- [ ] 사용자가 결과를 링크로 공유한다",
    "",
    "## 비목표",
    "",
    "- 계정 로그인은 다루지 않는다",
    "",
    "## 요구사항",
    "",
    "### 기능 요구사항",
    "",
    "- [ ] 공유 링크를 생성한다",
    "",
    "## 수용 기준",
    "",
    "- [ ] 공유 링크로 결과를 열 수 있다",
    "",
  ].join("\n");
}

function fullAdrBody() {
  return [
    "# ADR",
    "",
    "## 컨텍스트",
    "",
    "PRD 요구와 현재 제약을 고려한다.",
    "",
    "## 결정",
    "",
    "링크 기반 공유를 채택한다.",
    "",
    "## 선택지",
    "",
    "### 선택지 A: 링크 공유",
    "",
    "- 장점: 단순하다",
    "- 단점: 만료 관리가 필요하다",
    "",
    "### 선택지 B: 계정 공유",
    "",
    "- 장점: 권한 제어가 쉽다",
    "- 단점: 구현이 복잡하다",
    "",
    "## 선택 근거",
    "",
    "링크 공유가 더 단순하고 요구를 충족한다.",
    "",
    "## 결과",
    "",
    "### 긍정적 영향",
    "",
    "- 빠르게 공유한다",
    "",
    "### 부정적 영향 / 트레이드오프",
    "",
    "- 만료 처리가 필요하다",
    "",
    "## 후속 작업",
    "",
    "- 만료 정책을 정한다",
    "",
    "## 검증",
    "",
    "- 링크로 결과 열람을 확인한다",
    "",
  ].join("\n");
}

function runKickoff(projectRoot, type, slug, title) {
  return execFileSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "harness", "kickoff.mjs"), "--type", type, "--slug", slug, "--title", title],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function runApprove(projectRoot, unitPath, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "harness", "approve.mjs"), "--unit", unitPath, ...extraArgs],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function runGuard(payload) {
  return spawnSync(process.execPath, [path.join(repoRoot, "scripts", "harness", "claude-approval-guard.mjs")], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

describe("harness backlog fixes", () => {
  it("approve places the stage log under the real heading, not the rules prose (backtick literal)", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      runKickoff(projectRoot, "feature", "approve-log", "승인 로그");
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "approve-log");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "승인 로그", status: "review", unit_type: "feature", area: "승인 영역" })}\n${fullPrdBody()}`,
      );

      const approve = runApprove(projectRoot, "docs/raw/feature/approve-log", ["--quote", "그래 이 PRD랑 ADR 승인할게 진행해", "--adr"]);
      expect(approve.status).toBe(0);

      const state = read(path.join(unitDir, "state.md"));
      const logHeadingIdx = state.indexOf("## 단계 로그 (append-only)");
      const approvedLogIdx = state.indexOf("pre-approved: 사용자 명시 사전 승인");
      expect(logHeadingIdx).toBeGreaterThan(-1);
      // The log must land in the real section (after its heading), not spliced into
      // the rules prose above it that merely mentions `## 단계 로그` in backticks.
      expect(approvedLogIdx).toBeGreaterThan(logHeadingIdx);
    });
  });

  it("assertNoPlaceholders ignores code braces but still catches a real prose token", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const codeDir = path.join(projectRoot, "docs", "raw", "feature", "codeok");
      writeFile(
        path.join(codeDir, "prd.md"),
        `${frontmatter({ title: "codeok", status: "review", unit_type: "feature", area: "코드영역" })}\n${fullPrdBody()}\n\n상태 표기는 \`{ EXPLORE, REWARD }\`로 둔다.\n`,
      );
      writeFile(path.join(codeDir, "adr.md"), `${frontmatter({ title: "codeok", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      ingestArea(projectRoot, "docs/raw/feature/codeok");

      const tokenDir = path.join(projectRoot, "docs", "raw", "feature", "realtoken");
      writeFile(
        path.join(tokenDir, "prd.md"),
        `${frontmatter({ title: "realtoken", status: "review", unit_type: "feature", area: "토큰영역" })}\n${fullPrdBody()}\n\n남은 템플릿 토큰 {이름} 이 있다.\n`,
      );
      writeFile(path.join(tokenDir, "adr.md"), `${frontmatter({ title: "realtoken", status: "proposed", unit_type: "feature" })}\n# ADR\n`);
      ingestArea(projectRoot, "docs/raw/feature/realtoken");

      const out = `${runCheck(projectRoot).stdout}${runCheck(projectRoot).stderr}`;
      expect(out).toContain("{이름}"); // real leftover token in prose is caught
      expect(out).not.toContain("EXPLORE"); // inline-code braces are not
    });
  });

  it("assertPrdReferences fails a parent_prd that points to a missing file", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "child", { status: "review", area: "자식영역" });
      const prdPath = path.join(projectRoot, "docs", "raw", "feature", "child", "prd.md");
      writeFile(prdPath, read(prdPath).replace("unit_type: feature", "unit_type: feature\nparent_prd: ../missing-parent/prd.md"));
      ingestArea(projectRoot, "docs/raw/feature/child");

      const result = runCheck(projectRoot);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("parent_prd points to a missing file");
    });
  });

  it("assertPrdReferences passes a parent_prd that resolves", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "parent", { status: "review", area: "부모영역" });
      seedAreaFeature(projectRoot, "child", { status: "review", area: "자식영역" });
      const childPrd = path.join(projectRoot, "docs", "raw", "feature", "child", "prd.md");
      writeFile(childPrd, read(childPrd).replace("unit_type: feature", "unit_type: feature\nparent_prd: ../parent/prd.md"));
      ingestArea(projectRoot, "docs/raw/feature/parent");
      ingestArea(projectRoot, "docs/raw/feature/child");

      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("wiki-ingest warns when creating a new area while other areas exist (typo guard)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      seedAreaFeature(projectRoot, "first", { status: "review", area: "A화면" });
      ingestArea(projectRoot, "docs/raw/feature/first");
      seedAreaFeature(projectRoot, "second", { status: "review", area: "A 화면" }); // typo: extra space

      const result = spawnSync(
        process.execPath,
        [path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"), "docs/raw/feature/second"],
        { cwd: projectRoot, encoding: "utf8" },
      );
      expect(`${result.stdout}${result.stderr}`).toContain("새 영역 생성");
      expect(`${result.stdout}${result.stderr}`).toContain("A화면"); // shows the existing area to compare against
    });
  });

  it("ingest renders the real H1 title, not a frontmatter `#` comment line (extractH1 fix)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      // The REAL kickoff template keeps `# section(…)`/`# area(…)` hint lines in the
      // prd.md frontmatter — the exact shape that used to be mistaken for the H1.
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "title-render", "--title", "제목 렌더", "--area", "렌더 영역"]);
      expect(k.status).toBe(0);
      const prdPath = path.join(projectRoot, "docs", "raw", "feature", "title-render", "prd.md");
      writeFile(prdPath, read(prdPath).replace("status: draft", "status: review")); // settle so it ingests
      const ing = ingestUnit(projectRoot, "docs/raw/feature/title-render");
      expect(ing.status).toBe(0);

      const index = read(path.join(projectRoot, "docs", "wiki", "index.md"));
      expect(index).toContain("**제목 렌더**"); // the real title
      expect(index).not.toContain("section(섹션"); // never the frontmatter hint comment
    });
  });
});

describe("kickoff branch handling (worktree-first; main worktree reserved)", () => {
  it("does not auto-switch the reserved main worktree on a clean main; hints to isolate", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      commitAll(projectRoot); // main is now clean
      // The reserved main worktree is the developer's; kickoff never auto-branches it
      // in place. Work is expected to run in a dedicated origin/main-based worktree
      // the agent opened first — so on main the script stays put and only hints.
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "reserved-main", "--title", "예약된 main"]);
      expect(k.status).toBe(0);
      expect(currentBranch(projectRoot)).toBe("main"); // main worktree untouched
      expect(`${k.stdout}${k.stderr}`).toContain("워크트리"); // isolation hint
      // The raw skeleton is still materialized regardless of the branch decision.
      expect(fs.existsSync(path.join(projectRoot, "docs", "raw", "feature", "reserved-main", "prd.md"))).toBe(true);
    });
  });

  it("consumes the next-feature anchor even though it leaves the main worktree in place", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      commitAll(projectRoot);
      // The anchor is consumed as part of skeleton creation, independent of the branch
      // decision — leaving the reserved main worktree alone must not strand the anchor.
      writeFile(path.join(projectRoot, "docs", "raw", ".next-unit"), "feature/anchored | prd.md | 앵커영역 | \n");
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "anchored", "--title", "앵커"]);
      expect(k.status).toBe(0);
      expect(currentBranch(projectRoot)).toBe("main"); // reserved main worktree untouched
      expect(fs.existsSync(path.join(projectRoot, "docs", "raw", ".next-unit"))).toBe(false);
    });
  });

  it("leaves an already-checked-out work branch in place (branch-first; the normal in-worktree path)", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      commitAll(projectRoot);
      // Simulates the normal flow: the agent opened a dedicated worktree on the unit's
      // branch first, then runs kickoff inside it. The script recognizes branch-first
      // and neither switches nor complains.
      git(projectRoot, ["checkout", "-q", "-b", "feature/on-branch"]);
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "on-branch", "--title", "브랜치 위"]);
      expect(k.status).toBe(0);
      expect(currentBranch(projectRoot)).toBe("feature/on-branch");
      expect(fs.existsSync(path.join(projectRoot, "docs", "raw", "feature", "on-branch", "prd.md"))).toBe(true);
    });
  });

  it("creates an in-place branch on main only with the explicit --checkout escape hatch", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      commitAll(projectRoot);
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "forced", "--title", "강제", "--checkout"]);
      expect(k.status).toBe(0);
      expect(currentBranch(projectRoot)).toBe("feature/forced");
    });
  });

  it("stays put when --no-branch is passed, even on a clean main", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      commitAll(projectRoot);
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "stay", "--title", "머무름", "--no-branch"]);
      expect(k.status).toBe(0);
      expect(currentBranch(projectRoot)).toBe("main");
    });
  });

  it("hints instead of failing when the target branch already exists", () => {
    withGitProject((projectRoot) => {
      harnessInit(projectRoot);
      commitAll(projectRoot);
      git(projectRoot, ["branch", "feature/dup"]); // pre-create the target
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "dup", "--title", "중복"]);
      expect(k.status).toBe(0);
      expect(currentBranch(projectRoot)).toBe("main"); // did not switch
      expect(`${k.stdout}${k.stderr}`).toContain("이미 있습니다");
    });
  });

  it("is a no-op in a non-git project (kickoff still succeeds)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "nogit", "--title", "노깃"]);
      expect(k.status).toBe(0);
      expect(fs.existsSync(path.join(projectRoot, "docs", "raw", "feature", "nogit", "prd.md"))).toBe(true);
    });
  });
});

describe("kickoff --issue provenance", () => {
  it("records a bare issue number on a feature (prd frontmatter + state log)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "issue-feat", "--title", "이슈 기능", "--issue", "42"]);
      expect(k.status).toBe(0);
      expect(k.stdout).toContain("- issue: #42");
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "issue-feat");
      expect(read(path.join(unitDir, "prd.md"))).toContain('issue: "#42"');
      expect(read(path.join(unitDir, "state.md"))).toContain("kickoff: raw 골격 생성 (이슈 #42)");
    });
  });

  it("keeps a full issue URL as the recorded ref", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const url = "https://github.com/o/r/issues/42";
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "issue-url", "--title", "이슈 URL", "--issue", url]);
      expect(k.status).toBe(0);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "issue-url");
      expect(read(path.join(unitDir, "prd.md"))).toContain(`issue: "${url}"`);
      // The state-ledger note is a separate code path from the frontmatter field;
      // pin the URL rendering there too, not just the #<n> form.
      expect(read(path.join(unitDir, "state.md"))).toContain(`kickoff: raw 골격 생성 (이슈 ${url})`);
    });
  });

  it("records the issue on a bugfix's bugfix.md frontmatter and state ledger", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "bugfix", "--slug", "issue-bug", "--title", "이슈 버그", "--issue", "#7"]);
      expect(k.status).toBe(0);
      const unitDir = path.join(projectRoot, "docs", "raw", "bugfix", "issue-bug");
      expect(read(path.join(unitDir, "bugfix.md"))).toContain('issue: "#7"');
      expect(read(path.join(unitDir, "state.md"))).toContain("kickoff: raw 골격 생성 (이슈 #7)");
    });
  });

  it("records a chore's issue only in the state ledger (no primary artifact)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "chore", "--slug", "issue-chore", "--title", "이슈 정리", "--issue", "9"]);
      expect(k.status).toBe(0);
      const unitDir = path.join(projectRoot, "docs", "raw", "chore", "issue-chore");
      expect(read(path.join(unitDir, "state.md"))).toContain("kickoff: raw 골격 생성 (이슈 #9)");
      expect(fs.existsSync(path.join(unitDir, "prd.md"))).toBe(false);
      expect(fs.existsSync(path.join(unitDir, "bugfix.md"))).toBe(false);
    });
  });

  it("omits the issue line and note when no --issue is passed", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "feature", "--slug", "no-issue", "--title", "이슈 없음"]);
      expect(k.status).toBe(0);
      expect(k.stdout).not.toContain("- issue:");
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "no-issue");
      expect(read(path.join(unitDir, "prd.md"))).not.toContain("issue:");
      expect(read(path.join(unitDir, "state.md"))).toContain("kickoff: raw 골격 생성\n");
    });
  });

  it("rejects a bare issue-number positional (must resolve the issue first)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["42"]);
      expect(k.status).not.toBe(0);
      expect(`${k.stdout}${k.stderr}`).toContain("직접 넘길 수 없습니다");
      expect(fs.existsSync(path.join(projectRoot, "docs", "raw", "feature"))).toBe(false);
    });
  });

  it("rejects a value that is not an issue reference", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "chore", "--slug", "bad-issue", "--title", "나쁨", "--issue", "not-an-issue"]);
      expect(k.status).not.toBe(0);
      expect(`${k.stdout}${k.stderr}`).toContain("이슈 참조로 해석할 수 없습니다");
    });
  });

  it("rejects --issue with no value", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const k = kickoff(projectRoot, ["--type", "chore", "--slug", "no-val", "--title", "값없음", "--issue"]);
      expect(k.status).not.toBe(0);
      expect(`${k.stdout}${k.stderr}`).toContain("값이 필요합니다");
    });
  });
});

// Windows에서만 터지고 저장소에는 흔적이 남지 않는 세 실패(#1 gate ENOENT,
// #2 CRLF frontmatter 손상, #3 symlink가 텍스트 파일로 체크아웃)를 실제 플랫폼 없이
// 재현한다. 리눅스 CI는 인덱스(LF)와 정상 symlink만 보므로 이 픽스처들이 유일한
// 상시 방어선이다 — Windows CI를 붙여도 `.gitattributes` 때문에 CRLF는 재현되지 않는다.
describe("Windows failure modes", () => {
  it("harness:gate runs every step when npm did not launch it (no npm_execpath to inherit)", () => {
    withProject((projectRoot) => {
      seedGateScripts(projectRoot);

      // 이 조건이 곧 이슈 #1이다. 예전에는 spawnSync("npm", …)이 Windows에서 ENOENT로
      // 죽으면서 status가 null로 와, 첫 스텝에서 메시지 한 줄 없이 exit 1 했다.
      const result = runGate(projectRoot, { npm_execpath: undefined, npm_config_user_agent: undefined });

      expect(`${result.stdout}${result.stderr}`).toContain("[harness:gate] ok");
      expect(result.status).toBe(0);
    });
  });

  it("harness:gate propagates a failing step's exit status instead of swallowing it", () => {
    withProject((projectRoot) => {
      seedGateScripts(projectRoot, { lint: "node -e \"process.exit(3)\"" });

      const result = runGate(projectRoot, { npm_execpath: undefined });

      expect(result.status).toBe(3);
      expect(`${result.stdout}${result.stderr}`).not.toContain("[harness:gate] ok");
    });
  });

  it("harness:approve updates a CRLF worktree in place instead of stacking frontmatter blocks", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "crlf-unit");
      runKickoff(projectRoot, "feature", "crlf-unit", "CRLF 단위");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "CRLF", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      ingest(projectRoot, "docs/raw/feature/crlf-unit", "공유 기능");

      // core.autocrlf=true로 체크아웃된 상태를 그대로 만든다.
      convertToCrlf(unitDir);

      const approve = runApprove(projectRoot, "docs/raw/feature/crlf-unit", ["--quote", "이대로 사전 승인, 구현 들어가"]);
      expect(approve.status).toBe(0);

      // 손상 회귀의 핵심 신호. 예전에는 실행 한 번에 state.md 구분자가 6줄(블록 3개),
      // prd.md가 4줄(블록 2개)로 불어나고 status는 draft인 채 남았다.
      for (const fileName of ["prd.md", "state.md"]) {
        const lines = read(path.join(unitDir, fileName)).split(/\r?\n/);
        expect(lines.filter((line) => line === "---")).toHaveLength(2);
      }
      expect(read(path.join(unitDir, "prd.md"))).toContain("status: pre-approved");
      expect(read(path.join(unitDir, "state.md"))).toContain("prd_status: pre-approved");
      expect(runCheck(projectRoot).status).toBe(0);
    });
  });

  it("harness:check passes on a CRLF worktree (frontmatter is present, not missing)", () => {
    withProject((projectRoot) => {
      harnessInit(projectRoot);
      const unitDir = path.join(projectRoot, "docs", "raw", "feature", "crlf-check");
      runKickoff(projectRoot, "feature", "crlf-check", "CRLF 검사");
      writeFile(
        path.join(unitDir, "prd.md"),
        `${frontmatter({ title: "CRLF Check", status: "review", unit_type: "feature" })}\n${fullPrdBody()}`,
      );
      ingest(projectRoot, "docs/raw/feature/crlf-check", "공유 기능");
      convertToCrlf(unitDir);
      convertToCrlf(path.join(projectRoot, "docs", "wiki"));

      const result = runCheck(projectRoot);
      expect(`${result.stdout}${result.stderr}`).not.toContain("missing frontmatter");
      expect(result.status).toBe(0);
    });
  });

});

// 성공 스텝 로그는 에이전트 컨텍스트로 흘러드는 순수 노이즈라 gate가 요약하고,
// 실패 스텝만 전문을 낸다. 이 계약(요약 성공 / 전문 실패 / verbose 탈출구)이 깨지면
// 토큰 회귀거나 디버깅 근거 소실이므로 양방향 모두 고정한다.
describe("harness:gate condensed output", () => {
  it("summarizes passing steps instead of streaming their full output", () => {
    withProject((projectRoot) => {
      seedGateScripts(projectRoot, { lint: "node -e \"console.log('LINT_NOISE_LINE')\"" });

      const result = runGate(projectRoot, { npm_execpath: undefined, HARNESS_GATE_VERBOSE: undefined });

      expect(result.status).toBe(0);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).not.toContain("LINT_NOISE_LINE");
      expect(output).toContain("[harness:gate] lint ok");
      expect(output).toContain("[harness:gate] ok");
    });
  });

  it("dumps the failing step's full output before propagating its status", () => {
    withProject((projectRoot) => {
      seedGateScripts(projectRoot, { build: "node -e \"console.log('BUILD_FAIL_DETAIL'); process.exit(2)\"" });

      const result = runGate(projectRoot, { npm_execpath: undefined, HARNESS_GATE_VERBOSE: undefined });

      expect(result.status).toBe(2);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain("BUILD_FAIL_DETAIL");
      expect(output).not.toContain("[harness:gate] ok");
    });
  });

  it("HARNESS_GATE_VERBOSE=1 restores the full per-step output", () => {
    withProject((projectRoot) => {
      seedGateScripts(projectRoot, { lint: "node -e \"console.log('LINT_NOISE_LINE')\"" });

      const result = runGate(projectRoot, { npm_execpath: undefined, HARNESS_GATE_VERBOSE: "1" });

      expect(result.status).toBe(0);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain("LINT_NOISE_LINE");
      expect(output).toContain("[harness:gate] ok");
    });
  });

  it("surfaces the test summary lines from a passing test step", () => {
    withProject((projectRoot) => {
      seedGateScripts(projectRoot, {
        "test:run": "node -e \"console.log('noisy per-file line'); console.log(' Tests  3 passed (3)')\"",
      });

      const result = runGate(projectRoot, { npm_execpath: undefined, HARNESS_GATE_VERBOSE: undefined });

      expect(result.status).toBe(0);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain("[harness:gate] Tests  3 passed (3)");
      expect(output).not.toContain("noisy per-file line");
    });
  });

  it("reports a capture-limit overflow instead of misdiagnosing it as a spawn failure", () => {
    withProject((projectRoot) => {
      // 기본 스텝(배너+한 줄, ~50바이트)은 200바이트 한도를 통과하고,
      // lint의 1KB 출력만 ENOBUFS를 결정적으로 일으킨다.
      seedGateScripts(projectRoot, { lint: "node -e \"console.log('x'.repeat(1000))\"" });

      const result = runGate(projectRoot, { npm_execpath: undefined, HARNESS_GATE_MAX_BUFFER: "200" });

      expect(result.status).toBe(1);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain("캡처 한도");
      expect(output).not.toContain("패키지 매니저를 실행하지 못했습니다");
    });
  });

  it("still warns when the test step collected no tests", () => {
    withProject((projectRoot) => {
      seedGateScripts(projectRoot, { "test:run": "node -e \"console.log('no test files found')\"" });

      const result = runGate(projectRoot, { npm_execpath: undefined, HARNESS_GATE_VERBOSE: undefined });

      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("WARNING: no tests collected");
    });
  });
});

// gate 픽스처: gate.mjs는 첫 스텝(harness:check)을 플러그인 엔진(artifact-check.mjs)으로
// 직접 돌리므로, 소비자를 유효한 하네스 프로젝트로 초기화해 그 검사가 통과하게 한다
// (harnessInit이 .harness.json·docs를 깔고, "fresh 소비자는 check 통과"는 별도 테스트가
// 검증한다). 나머지 lint/build/test:run은 즉시 끝나는 스텁이라 검증 대상은 스텝 내용이
// 아니라 gate 오케스트레이션(축약출력·실패덤프·요약 표면화)이다.
function seedGateScripts(projectRoot, overrides = {}) {
  harnessInit(projectRoot);
  const scripts = {
    lint: 'node -e "console.log(0)"',
    build: 'node -e "console.log(0)"',
    "test:run": 'node -e "console.log(0)"',
    ...overrides,
  };
  writeFile(path.join(projectRoot, "package.json"), `${JSON.stringify({ name: "gate-fixture", private: true, scripts }, null, 2)}\n`);
}

function runGate(projectRoot, envOverrides = {}) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, [path.join(repoRoot, "scripts", "harness", "gate.mjs")], {
    cwd: projectRoot,
    encoding: "utf8",
    env,
  });
}

// 디렉터리의 모든 텍스트 파일을 CRLF로 바꿔, Git for Windows 체크아웃을 재현한다.
function convertToCrlf(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      convertToCrlf(entryPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const content = fs.readFileSync(entryPath, "utf8");
    fs.writeFileSync(entryPath, content.replace(/\r?\n/g, "\r\n"), "utf8");
  }
}

function frontmatter(fields) {
  const lines = Object.entries({ date: "2026-01-01", ...fields }).map(([key, value]) => `${key}: ${value}`);
  return ["---", ...lines, "---"].join("\n");
}

function withProject(callback) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llm-harness-flows-"));
  try {
    // No `.harness` mount in the plugin model: the consumer is an empty temp dir and
    // every engine script is spawned from `repoRoot` (this plugin) with cwd here.
    callback(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function withGitProject(callback) {
  withProject((projectRoot) => {
    git(projectRoot, ["init", "-q"]);
    git(projectRoot, ["checkout", "-q", "-b", "main"]);
    callback(projectRoot);
  });
}

// Bootstraps a temp consumer into the harness plugin model: writes `.harness.json`,
// merges `.claude/settings.json`, scaffolds docs. `--no-git-hooks` so a non-git
// temp dir does not try to install hooks (a hooks-targeted test opts back in).
function harnessInit(projectRoot, extraArgs = ["--no-git-hooks"]) {
  execFileSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "harness", "init.mjs"), ...extraArgs],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function ingest(projectRoot, unitPath, category = defaultCategoryFor(unitPath)) {
  const args = [path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"), unitPath];
  if (category) args.push("--category", category);
  execFileSync(
    process.execPath,
    args,
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function defaultCategoryFor(unitPath) {
  return unitPath.includes("/feature/") ? "맞춤 기능 축" : null;
}

// Ingests using the area path (frontmatter `area` when no explicit --area is
// passed), mirroring how ingest resolves the durable axis in real usage.
function ingestArea(projectRoot, unitPath, area) {
  const args = [path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"), unitPath];
  if (area) args.push("--area", area);
  execFileSync(process.execPath, args, { cwd: projectRoot, encoding: "utf8" });
}

// Writes a review-ready feature unit (prd.md + adr.md skeleton). Passing `area`
// declares it in the prd frontmatter; `date` overrides the timeline date.
function seedAreaFeature(projectRoot, slug, { status = "review", area, section, date } = {}) {
  const unitDir = path.join(projectRoot, "docs", "raw", "feature", slug);
  const prdFields = { title: slug, status, unit_type: "feature" };
  if (section) prdFields.section = section;
  if (area) prdFields.area = area;
  if (date) prdFields.date = date;
  writeFile(path.join(unitDir, "prd.md"), `${frontmatter(prdFields)}\n${fullPrdBody()}`);
  writeFile(path.join(unitDir, "adr.md"), `${frontmatter({ title: slug, status: "proposed", unit_type: "feature" })}\n# ADR\n`);
}

// Runs wiki-ingest reading the unit's frontmatter (section + area), returning the
// spawn result so tests can assert success or a routing/section failure.
function ingestUnit(projectRoot, unitPath) {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "harness", "wiki-ingest.mjs"), unitPath],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function kickoff(projectRoot, args) {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "harness", "kickoff.mjs"), ...args],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

// Rewrites an existing feature unit's prd.md to declare an area, leaving the wiki
// link where it was (so declaration↔render drift can be exercised).
function declareArea(projectRoot, slug, area) {
  const prdPath = path.join(projectRoot, "docs", "raw", "feature", slug, "prd.md");
  writeFile(prdPath, `${frontmatter({ title: slug, status: "review", unit_type: "feature", area })}\n${fullPrdBody()}`);
}

function runVerifyMsg(projectRoot, msgPath) {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "harness", "verify-commit-msg.mjs"), msgPath],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function runCheck(projectRoot) {
  return spawnSync(process.execPath, [path.join(repoRoot, "scripts", "harness", "artifact-check.mjs")], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

function commitAll(projectRoot) {
  git(projectRoot, ["add", "-A"]);
  git(projectRoot, ["-c", "user.email=test@example.com", "-c", "user.name=Harness Test", "commit", "-q", "-m", "seed", "--no-verify"]);
}

function git(projectRoot, args) {
  execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function currentBranch(projectRoot) {
  // symbolic-ref resolves the branch name even on an unborn branch (fresh repo with
  // no commits), where `rev-parse --abbrev-ref HEAD` errors.
  return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim();
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
