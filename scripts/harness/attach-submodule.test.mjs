import { execFileSync } from "node:child_process";
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

function withProject(callback) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llm-harness-attach-"));
  try {
    fs.symlinkSync(repoRoot, path.join(projectRoot, ".harness"), "dir");
    callback(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function runAttach(projectRoot, args = []) {
  return execFileSync(
    process.execPath,
    [path.join(projectRoot, ".harness", "scripts", "harness", "attach-submodule.mjs"), "--harness-dir", ".harness", ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
}

function runHarnessCheck(projectRoot) {
  execFileSync(process.execPath, [path.join(projectRoot, ".harness", "scripts", "harness", "artifact-check.mjs")], {
    cwd: projectRoot,
    encoding: "utf8",
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
