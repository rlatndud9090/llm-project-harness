import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("wiki-ingest", () => {
  it("does not duplicate a unit link when ingested twice", () => {
    withProject((projectRoot) => {
      attach(projectRoot);
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
      attach(projectRoot);
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
      attach(projectRoot);
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
      attach(projectRoot);
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
      attach(projectRoot);
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
      attach(projectRoot);
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
      attach(projectRoot);
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
      attach(projectRoot);
      const msgPath = path.join(projectRoot, "COMMIT_MSG.txt");
      writeFile(msgPath, "feat: do a thing\n\n맥락 설명.\n");
      const result = runVerifyMsg(projectRoot, msgPath);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("관련 문서");
    });
  });

  it("accepts a commit message with a 관련 문서 block and link", () => {
    withProject((projectRoot) => {
      attach(projectRoot);
      const msgPath = path.join(projectRoot, "COMMIT_MSG.txt");
      writeFile(msgPath, "feat: do a thing\n\n맥락.\n\n관련 문서:\n[PRD](docs/raw/feature/x/prd.md)\n");
      const result = runVerifyMsg(projectRoot, msgPath);
      expect(result.status).toBe(0);
    });
  });

  it("skips auto-generated merge commits", () => {
    withProject((projectRoot) => {
      attach(projectRoot);
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
      attach(projectRoot);
      execFileSync(process.execPath, [path.join(projectRoot, ".harness", "scripts", "harness", "install-hooks.mjs")], {
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

describe("artifact-check required sections", () => {
  it("fails a review PRD missing required sections", () => {
    withProject((projectRoot) => {
      attach(projectRoot);
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
      attach(projectRoot);
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
      attach(projectRoot);
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

function seedDecisionUnit(projectRoot, adrStatus, adrApproval) {
  attach(projectRoot);
  const unitDir = path.join(projectRoot, "docs", "raw", "feature", "decision");
  writeFile(path.join(unitDir, "prd.md"), `${frontmatter({ title: "Decision", status: "draft", unit_type: "feature" })}\n# Decision\n`);
  writeFile(
    path.join(unitDir, "adr.md"),
    `${frontmatter({ title: "Decision", status: adrStatus, unit_type: "feature", approval: adrApproval })}\n# Decision\n`,
  );
  ingest(projectRoot, "docs/raw/feature/decision");
  commitAll(projectRoot);
}

function regressAdrStatus(projectRoot, status) {
  const adrPath = path.join(projectRoot, "docs", "raw", "feature", "decision", "adr.md");
  // superseded/deprecated keep no approval requirement; proposed has none either
  writeFile(adrPath, `${frontmatter({ title: "Decision", status, unit_type: "feature" })}\n# Decision\n`);
}

function frontmatter(fields) {
  const lines = Object.entries({ date: "2026-01-01", ...fields }).map(([key, value]) => `${key}: ${value}`);
  return ["---", ...lines, "---"].join("\n");
}

function withProject(callback) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llm-harness-flows-"));
  try {
    fs.symlinkSync(repoRoot, path.join(projectRoot, ".harness"), "dir");
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

function attach(projectRoot) {
  execFileSync(
    process.execPath,
    [path.join(projectRoot, ".harness", "scripts", "harness", "attach-submodule.mjs"), "--harness-dir", ".harness"],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function ingest(projectRoot, unitPath) {
  execFileSync(
    process.execPath,
    [path.join(projectRoot, ".harness", "scripts", "harness", "wiki-ingest.mjs"), unitPath],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function runVerifyMsg(projectRoot, msgPath) {
  return spawnSync(
    process.execPath,
    [path.join(projectRoot, ".harness", "scripts", "harness", "verify-commit-msg.mjs"), msgPath],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function runCheck(projectRoot) {
  return spawnSync(process.execPath, [path.join(projectRoot, ".harness", "scripts", "harness", "artifact-check.mjs")], {
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

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
