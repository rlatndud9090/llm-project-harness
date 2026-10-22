import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 지식 계층 도입 배선(doctor 안내 · init 시드/AGENTS 줄 · session-start 한 줄)을 검증한다.
// 엔진은 이 저장소(플러그인)에서, cwd는 임시 소비 프로젝트로 spawn한다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = (name) => path.join(repoRoot, "scripts", "harness", name);
const AGENTS_LINE = "knowledge.mjs\" brief --paths";

function withProject(callback) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llm-knowledge-adoption-"));
  try {
    callback(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function init(projectRoot, extraArgs = []) {
  return execFileSync(process.execPath, [script("init.mjs"), "--no-git-hooks", ...extraArgs], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

function doctor(projectRoot) {
  const result = spawnSync(process.execPath, [script("doctor.mjs")], { cwd: projectRoot, encoding: "utf8" });
  expect(result.status).toBe(0);
  return result.stdout;
}

function sessionStart(projectRoot) {
  const result = spawnSync(process.execPath, [script("session-start.mjs")], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
  });
  expect(result.status).toBe(0);
  return result.stdout;
}

function adopt(projectRoot) {
  writeFile(path.join(projectRoot, ".harness.json"), JSON.stringify({ harness: "llm-project-harness", version: "0.0.1" }));
}

function finalFeature(projectRoot, slug) {
  writeFile(
    path.join(projectRoot, "docs", "raw", "feature", slug, "prd.md"),
    `---\ntitle: ${slug}\nstatus: approved\nunit_type: feature\narea: 결제\ndate: 2026-01-01\n---\n\n# ${slug}\n`,
  );
}

function marker(projectRoot) {
  writeFile(
    path.join(projectRoot, "docs", "knowledge", "index.md"),
    "---\nlph-knowledge: 1\nknowledge_schema: 1\nbootstrap: not-needed\n---\n\n# 프로젝트 지식\n",
  );
  writeFile(path.join(projectRoot, "docs", "knowledge", "_tombstones.md"), "| ID | 상태 | 대체 | 사유 |\n| --- | --- | --- | --- |\n");
}

function bootstrapLedger(projectRoot, status) {
  writeFile(
    path.join(projectRoot, "docs", "knowledge", "bootstrap.md"),
    `---\nstatus: ${status}\nbase_commit: abc1234\nplan_hash: 0123456789ab\n---\n\n| unit | area | date | 판정 | IDs | 비고 |\n| --- | --- | --- | --- | --- | --- |\n`,
  );
}

describe("doctor knowledge section", () => {
  it("recommends bootstrap when unmarked and final units exceed 5", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      for (let i = 0; i < 6; i += 1) finalFeature(projectRoot, `unit-${i}`);
      const out = doctor(projectRoot);
      expect(out).toContain("- 지식: 미활성(final 단위 6건)");
      expect(out).toContain("/knowledge-distill --bootstrap");
    });
  });

  it("recommends seed when unmarked and final units are 5 or fewer", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      for (let i = 0; i < 5; i += 1) finalFeature(projectRoot, `unit-${i}`);
      const out = doctor(projectRoot);
      expect(out).toContain("- 지식: 미활성(final 단위 5건)");
      expect(out).toContain("knowledge.mjs\" seed");
      const knowledgeLine = out.split("\n").find((l) => l.startsWith("- 지식:"));
      expect(knowledgeLine).not.toContain("--bootstrap");
    });
  });

  it("points to bootstrap status while a bootstrap is in progress", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      bootstrapLedger(projectRoot, "in-progress");
      const out = doctor(projectRoot);
      expect(out).toContain("소급 부트스트랩 진행 중");
      expect(out).toContain("bootstrap status");
    });
  });

  it("detects a legacy gotchas file as a bootstrap seed source", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      writeFile(path.join(projectRoot, "docs", "gotchas.md"), "# 함정\n");
      const out = doctor(projectRoot);
      expect(out).toContain("docs/gotchas.md");
      expect(out).toContain("시드 소스");
      expect(read(path.join(projectRoot, "docs", "gotchas.md"))).toBe("# 함정\n");
    });
  });

  it("asks for consolidate when active with pending final units", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      marker(projectRoot);
      finalFeature(projectRoot, "pay-retry");
      const out = doctor(projectRoot);
      expect(out).toContain("기록 대기 1건");
      expect(out).toContain("/knowledge-distill --consolidate");
    });
  });

  it("stays a single compact line when active with nothing pending", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      marker(projectRoot);
      const out = doctor(projectRoot);
      expect(out).toContain("- 지식: 활성");
      expect(out).not.toContain("--consolidate");
    });
  });

  it("reports the knowledge section on the uninitialized path too", () => {
    withProject((projectRoot) => {
      const out = doctor(projectRoot);
      expect(out).toContain("status=uninitialized");
      expect(out).toContain("- 지식: 미활성");
    });
  });
});

describe("init knowledge wiring", () => {
  it("seeds the marker and tombstones for a brand-new scaffold", () => {
    withProject((projectRoot) => {
      init(projectRoot);
      expect(read(path.join(projectRoot, "docs", "knowledge", "index.md"))).toContain("lph-knowledge: 1");
      expect(fs.existsSync(path.join(projectRoot, "docs", "knowledge", "_tombstones.md"))).toBe(true);
      expect(read(path.join(projectRoot, "AGENTS.md"))).toContain(AGENTS_LINE);
    });
  });

  it("creates nothing in docs/knowledge when retrofitting an existing docs tree", () => {
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, "docs", "raw", "README.md"), "# raw\n");
      writeFile(path.join(projectRoot, "AGENTS.md"), "# Agents\n\n<!-- LLM-HARNESS:START -->\nold\n<!-- LLM-HARNESS:END -->\n");
      init(projectRoot, ["--retrofit"]);
      expect(fs.existsSync(path.join(projectRoot, "docs", "knowledge"))).toBe(false);
      expect(read(path.join(projectRoot, "AGENTS.md"))).toContain(AGENTS_LINE);
    });
  });

  it("does not seed when docs already exist even without --retrofit", () => {
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, "docs", "notes.md"), "# 기존 문서\n");
      init(projectRoot);
      expect(fs.existsSync(path.join(projectRoot, "docs", "knowledge"))).toBe(false);
    });
  });

  it("upserts the AGENTS brief line idempotently, also on a plain re-run", () => {
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, "docs", "raw", "README.md"), "# raw\n");
      writeFile(path.join(projectRoot, "AGENTS.md"), "# Agents\n\n프로젝트 소유 본문\n\n<!-- LLM-HARNESS:START -->\nold block\n<!-- LLM-HARNESS:END -->\n");
      init(projectRoot, ["--retrofit"]);
      const once = read(path.join(projectRoot, "AGENTS.md"));
      init(projectRoot, ["--retrofit"]);
      init(projectRoot);
      const again = read(path.join(projectRoot, "AGENTS.md"));
      expect(again).toBe(once);
      expect(again.split(AGENTS_LINE).length - 1).toBe(1);
      expect(again).toContain("프로젝트 소유 본문");
    });
  });

  it("refreshes a stale marker block on a non-retrofit re-run but leaves unmarked AGENTS.md alone", () => {
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, "docs", "raw", "README.md"), "# raw\n");
      writeFile(path.join(projectRoot, "AGENTS.md"), "# Agents\n\n<!-- LLM-HARNESS:START -->\nold\n<!-- LLM-HARNESS:END -->\n");
      init(projectRoot);
      expect(read(path.join(projectRoot, "AGENTS.md"))).toContain(AGENTS_LINE);
    });
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, "docs", "raw", "README.md"), "# raw\n");
      writeFile(path.join(projectRoot, "AGENTS.md"), "# 내 가이드\n");
      init(projectRoot);
      expect(read(path.join(projectRoot, "AGENTS.md"))).toBe("# 내 가이드\n");
    });
  });
});

describe("session-start knowledge line", () => {
  it("is silent about knowledge normally", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      marker(projectRoot);
      expect(sessionStart(projectRoot)).not.toContain("지식 계층");
    });
  });

  it("adds exactly one line while a bootstrap is in progress", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      bootstrapLedger(projectRoot, "in-progress");
      const out = sessionStart(projectRoot);
      expect(out.split("\n").filter((line) => line.includes("지식 계층"))).toHaveLength(1);
      expect(out).toContain("/knowledge-distill --bootstrap");
    });
  });

  it("goes silent again once the bootstrap is complete", () => {
    withProject((projectRoot) => {
      adopt(projectRoot);
      bootstrapLedger(projectRoot, "complete");
      expect(sessionStart(projectRoot)).not.toContain("지식 계층");
    });
  });
});
