import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("attach-submodule", () => {
  it("attaches harness surfaces to a new consuming project", () => {
    withProject((projectRoot) => {
      runAttach(projectRoot);
      const wikiTemplate = fs.readFileSync(path.join(repoRoot, "harness", "templates", "wiki", "index.md"), "utf8");

      expect(readJson(path.join(projectRoot, "package.json")).scripts).toMatchObject({
        "harness:kickoff": "node .harness/scripts/harness/kickoff.mjs",
        "harness:approve": "node .harness/scripts/harness/approve.mjs",
        "harness:ingest": "node .harness/scripts/harness/wiki-ingest.mjs",
        "harness:check": "node .harness/scripts/harness/artifact-check.mjs",
        "harness:gate": "node .harness/scripts/harness/gate.mjs",
      });
      expect(pathExists(path.join(projectRoot, "AGENTS.md"))).toBe(true);
      expect(pathExists(path.join(projectRoot, "docs", "raw", "README.md"))).toBe(true);
      expect(pathExists(path.join(projectRoot, "docs", "wiki", "index.md"))).toBe(true);
      expect(fs.readFileSync(path.join(projectRoot, "docs", "wiki", "index.md"), "utf8")).toBe(wikiTemplate);
      expect(pathExists(path.join(projectRoot, "docs", "harness"))).toBe(false);
      expect(pathExists(path.join(projectRoot, "scripts", "harness"))).toBe(false);
      expect(isSymlink(path.join(projectRoot, ".codex", "skills", "next-feature"))).toBe(true);
      expect(isSymlink(path.join(projectRoot, ".claude", "skills", "next-feature"))).toBe(true);
      expect(pathExists(path.join(projectRoot, ".agents"))).toBe(false);
      expect(readJson(path.join(projectRoot, ".claude", "settings.json"))).toEqual({
        worktree: { bgIsolation: "none" },
      });

      runHarnessCheck(projectRoot);
    });
  });

  it("merges worktree.bgIsolation into an existing .claude/settings.json without clobbering other keys", () => {
    withProject((projectRoot) => {
      writeJson(path.join(projectRoot, ".claude", "settings.json"), {
        permissions: { allow: ["Bash(git status:*)"] },
        worktree: { autoCleanup: true },
      });

      runAttach(projectRoot);

      expect(readJson(path.join(projectRoot, ".claude", "settings.json"))).toEqual({
        permissions: { allow: ["Bash(git status:*)"] },
        worktree: { autoCleanup: true, bgIsolation: "none" },
      });

      runHarnessCheck(projectRoot);
    });
  });

  it("preserves an explicit worktree.bgIsolation override unless --force", () => {
    withProject((projectRoot) => {
      const settingsPath = path.join(projectRoot, ".claude", "settings.json");
      writeJson(settingsPath, { worktree: { bgIsolation: "worktree" } });

      const output = runAttach(projectRoot);
      expect(output).toContain('worktree.bgIsolation is "worktree"');
      expect(readJson(settingsPath)).toEqual({ worktree: { bgIsolation: "worktree" } });

      runAttach(projectRoot, ["--force"]);
      expect(readJson(settingsPath)).toEqual({ worktree: { bgIsolation: "none" } });
    });
  });

  it("skips .claude/settings.json when --no-claude-settings is set and during dry-run", () => {
    withProject((projectRoot) => {
      runAttach(projectRoot, ["--no-claude-settings"]);
      expect(pathExists(path.join(projectRoot, ".claude", "settings.json"))).toBe(false);

      const output = runAttach(projectRoot, ["--dry-run"]);
      expect(output).toContain("[dry-run] create .claude/settings.json (worktree.bgIsolation: none)");
      expect(pathExists(path.join(projectRoot, ".claude", "settings.json"))).toBe(false);
    });
  });

  it("retrofits existing files with markers, fallbacks, and llm-harness scripts", () => {
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, "AGENTS.md"), "# Existing Guide\n\nKeep me.\n");
      writeFile(path.join(projectRoot, "docs", "wiki", "index.md"), "# Existing Wiki\n\nKeep me too.\n");
      writeFile(path.join(projectRoot, ".codex", "skills", "next-feature", "SKILL.md"), "# Local next-feature\n");
      writeFile(path.join(projectRoot, ".codex", "skills", "kickoff", "SKILL.md"), "# Local kickoff\n");
      writeJson(path.join(projectRoot, "package.json"), {
        private: true,
        scripts: {
          "harness:check": "custom check",
        },
      });

      runAttach(projectRoot, ["--retrofit", "--report", "harness-retrofit-report.md"]);

      const agents = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
      const wiki = fs.readFileSync(path.join(projectRoot, "docs", "wiki", "index.md"), "utf8");
      const packageScripts = readJson(path.join(projectRoot, "package.json")).scripts;
      const report = fs.readFileSync(path.join(projectRoot, "harness-retrofit-report.md"), "utf8");

      expect(agents).toContain("Keep me.");
      expect(agents).toContain("<!-- LLM-HARNESS:START -->");
      expect(wiki).toContain("Keep me too.");
      expect(wiki).toContain("<!-- LLM-HARNESS:WIKI:START -->");
      expect(fs.readFileSync(path.join(projectRoot, ".codex", "skills", "kickoff", "SKILL.md"), "utf8")).toBe(
        "# Local kickoff\n",
      );
      expect(isSymlink(path.join(projectRoot, ".codex", "skills", "harness-next-feature"))).toBe(true);
      expect(isSymlink(path.join(projectRoot, ".codex", "skills", "harness-kickoff"))).toBe(true);
      expect(packageScripts["harness:check"]).toBe("custom check");
      expect(packageScripts["llm-harness:check"]).toBe("node .harness/scripts/harness/artifact-check.mjs");
      expect(packageScripts["harness:kickoff"]).toBe("node .harness/scripts/harness/kickoff.mjs");
      expect(report).toContain("- Mode: retrofit");
      expect(report).toContain("- local adapter override: .codex/skills/next-feature");
      expect(report).toContain("- package script override: harness:check");

      runHarnessCheck(projectRoot);
    });
  });

  it("reports retrofit changes without mutating files during dry-run", () => {
    withProject((projectRoot) => {
      const agentsPath = path.join(projectRoot, "AGENTS.md");
      const wikiPath = path.join(projectRoot, "docs", "wiki", "index.md");
      const packagePath = path.join(projectRoot, "package.json");
      writeFile(agentsPath, "# Existing Guide\n");
      writeFile(wikiPath, "# Existing Wiki\n");
      writeJson(packagePath, { private: true, scripts: { "harness:check": "custom check" } });

      const agentsBefore = fs.readFileSync(agentsPath, "utf8");
      const wikiBefore = fs.readFileSync(wikiPath, "utf8");
      const packageBefore = fs.readFileSync(packagePath, "utf8");
      const output = runAttach(projectRoot, ["--retrofit", "--dry-run"]);

      expect(output).toContain("[dry-run] update AGENTS.md marker LLM-HARNESS");
      expect(output).toContain("[dry-run] update docs/wiki/index.md marker LLM-HARNESS:WIKI");
      expect(fs.readFileSync(agentsPath, "utf8")).toBe(agentsBefore);
      expect(fs.readFileSync(wikiPath, "utf8")).toBe(wikiBefore);
      expect(fs.readFileSync(packagePath, "utf8")).toBe(packageBefore);
      expect(pathExists(path.join(projectRoot, ".codex"))).toBe(false);
    });
  });

  it("prunes stale harness symlinks left by an older harness version by default", () => {
    withProject((projectRoot) => {
      runAttach(projectRoot);

      // an adapter that existed in an older harness version but was renamed/removed
      const staleLink = path.join(projectRoot, ".codex", "skills", "artifact-check");
      fs.symlinkSync(path.join("..", "..", ".harness", ".codex", "skills", "artifact-check"), staleLink, "dir");
      const staleGenericLink = path.join(projectRoot, ".agents", "skills", "next-feature");
      fs.mkdirSync(path.dirname(staleGenericLink), { recursive: true });
      fs.symlinkSync(path.join("..", "..", ".harness", ".agents", "skills", "next-feature"), staleGenericLink, "dir");
      // a project-owned local skill that must survive pruning
      writeFile(path.join(projectRoot, ".codex", "skills", "team-ritual", "SKILL.md"), "# Local skill\n");

      // a plain re-attach (no flags) cleans up the stale link
      runAttach(projectRoot);

      expect(lexists(staleLink)).toBe(false);
      expect(lexists(staleGenericLink)).toBe(false);
      expect(pathExists(path.join(projectRoot, ".agents"))).toBe(false);
      expect(isSymlink(path.join(projectRoot, ".codex", "skills", "artifact-validation"))).toBe(true);
      expect(pathExists(path.join(projectRoot, ".codex", "skills", "team-ritual", "SKILL.md"))).toBe(true);

      runHarnessCheck(projectRoot);
    });
  });

  it("keeps stale harness symlinks and warns when --no-prune is set", () => {
    withProject((projectRoot) => {
      runAttach(projectRoot);

      const staleLink = path.join(projectRoot, ".codex", "skills", "artifact-check");
      fs.symlinkSync(path.join("..", "..", ".harness", ".codex", "skills", "artifact-check"), staleLink, "dir");

      const output = runAttach(projectRoot, ["--no-prune"]);

      expect(output).toContain("stale harness link .codex/skills/artifact-check");
      expect(lexists(staleLink)).toBe(true);
    });
  });
});

// Windows에서 어댑터가 조용히 무너지는 경로(#3): git이 symlink를 만들지 못하면
// 링크 대신 타겟 경로가 적힌 텍스트 파일이 체크아웃되는데 git status는 깨끗하다.
// 아래 케이스들은 전부 플랫폼 독립이다(실제 Windows 없이도 리눅스 CI에서 돈다).
describe("attach-submodule Windows environment", () => {
  it("seeds .gitattributes so a Windows checkout cannot introduce CRLF", () => {
    withProject((projectRoot) => {
      runAttach(projectRoot);

      const attributes = fs.readFileSync(path.join(projectRoot, ".gitattributes"), "utf8");
      expect(attributes).toContain("* text=auto eol=lf");
      expect(attributes).toContain("*.png binary");

      runHarnessCheck(projectRoot);
    });
  });

  it("keeps a project's own .gitattributes but warns when it does not pin eol", () => {
    withProject((projectRoot) => {
      writeFile(path.join(projectRoot, ".gitattributes"), "*.png binary\n");

      const output = runAttach(projectRoot);

      expect(fs.readFileSync(path.join(projectRoot, ".gitattributes"), "utf8")).toBe("*.png binary\n");
      expect(output).toContain("kept .gitattributes");
      expect(output).toContain("eol=lf");
    });
  });

  it("refuses to attach when git cannot record symlinks, and names the local-config trap", () => {
    withProject((projectRoot) => {
      git(projectRoot, ["init", "-q"]);
      // clone 시점에 git이 시스템 기본값을 저장소로 복사해 두는 상황을 그대로 재현한다.
      git(projectRoot, ["config", "core.symlinks", "false"]);

      const result = runAttachRaw(projectRoot, [], { HARNESS_SKIP_ENV_CHECK: "" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("core.symlinks=false");
      // 전역 설정만 바꿔서는 안 고쳐진다는 사실이 처방의 핵심이다.
      expect(result.stderr).toContain("git config --unset core.symlinks");
      // 절반만 장착된 상태를 남기지 않는다.
      expect(pathExists(path.join(projectRoot, ".claude"))).toBe(false);
      expect(pathExists(path.join(projectRoot, "docs"))).toBe(false);
    });
  });

  it("repairs adapters that were checked out as one-line text files, leaving real overrides alone", () => {
    withProject((projectRoot) => {
      // core.symlinks=false로 clone된 저장소의 실제 모습: 링크가 아니라 경로 한 줄.
      const brokenLink = path.join(projectRoot, ".claude", "skills", "next-feature");
      writeFile(brokenLink, "../../.harness/.claude/skills/next-feature");
      const localOverride = path.join(projectRoot, ".claude", "commands", "kickoff.md");
      writeFile(localOverride, "# 프로젝트 전용 kickoff\n\n이 파일은 프로젝트가 직접 작성했다.\n");

      const output = runAttach(projectRoot);

      expect(output).toContain("repair .claude/skills/next-feature");
      expect(isSymlink(brokenLink)).toBe(true);
      expect(pathExists(path.join(brokenLink, "SKILL.md"))).toBe(true);

      // 하네스 밖을 가리키지 않는 진짜 로컬 파일은 절대 지우지 않는다.
      expect(output).toContain("kept local override .claude/commands/kickoff.md");
      expect(fs.readFileSync(localOverride, "utf8")).toContain("프로젝트가 직접 작성했다");
    });
  });
});

function runAttachRaw(projectRoot, args = [], env = {}) {
  return spawnSync(
    process.execPath,
    [path.join(projectRoot, ".harness", "scripts", "harness", "attach-submodule.mjs"), "--harness-dir", ".harness", ...args],
    { cwd: projectRoot, encoding: "utf8", env: { ...process.env, ...env } },
  );
}

function git(projectRoot, args) {
  execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function withProject(callback) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llm-harness-attach-"));
  try {
    fs.symlinkSync(repoRoot, path.join(projectRoot, ".harness"), "dir");
    callback(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

// 픽스처는 임시 디렉터리에서 돌아 호스트의 git 전역/시스템 설정을 그대로 상속한다.
// Git for Windows 러너는 core.symlinks=false가 시스템 기본값이라, 진단을 끄지 않으면
// 테스트 통과 여부가 실행 머신의 설정에 따라 갈린다. 진단 자체는 그것을 명시적으로
// 켜는 전용 테스트에서 검증한다.
function runAttach(projectRoot, args = [], env = {}) {
  return execFileSync(
    process.execPath,
    [path.join(projectRoot, ".harness", "scripts", "harness", "attach-submodule.mjs"), "--harness-dir", ".harness", ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, HARNESS_SKIP_ENV_CHECK: "1", ...env },
    },
  );
}

function runHarnessCheck(projectRoot) {
  execFileSync(process.execPath, [path.join(projectRoot, ".harness", "scripts", "harness", "artifact-check.mjs")], {
    cwd: projectRoot,
    encoding: "utf8",
    // `.harness` points at the provider repo (real origin); skip the network
    // freshness probe so the check stays fast and deterministic in tests.
    env: { ...process.env, HARNESS_SKIP_REMOTE_CHECK: "1" },
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function isSymlink(filePath) {
  return fs.lstatSync(filePath).isSymbolicLink();
}

function lexists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}
