import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), "set-fleet-title.mjs");

let home;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-title-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function writeJob(jobId, state) {
  const dir = path.join(home, ".claude", "jobs", jobId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "state.json");
  fs.writeFileSync(p, JSON.stringify(state));
  return p;
}

function run(env, args) {
  return execFileSync("node", [HELPER, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, ...env },
  });
}

function readName(statePath) {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

describe("set-fleet-title", () => {
  it("--slug 은 하이픈을 공백으로 바꾸고 --abbr 로 약어를 지정한다", () => {
    const sp = writeJob("j1", { sessionId: "SID", name: "old", nameSource: "auto" });
    run({ CLAUDE_CODE_SESSION_ID: "SID" }, ["--slug", "do-next-thing", "--abbr", "PBQ"]);
    const d = readName(sp);
    expect(d.name).toBe("<PBQ> do next thing");
    expect(d.nameSource).toBe("user");
  });

  it("--label 은 그대로 쓰고 resumeSessionId 로도 매칭한다", () => {
    const sp = writeJob("j2", { resumeSessionId: "R1", name: "o", nameSource: "auto" });
    run({ CLAUDE_CODE_SESSION_ID: "R1" }, ["--label", "next-feature", "--abbr", "AB"]);
    expect(readName(sp).name).toBe("<AB> next-feature");
  });

  it("매칭되는 job 이 없으면 아무 파일도 바꾸지 않는다", () => {
    const sp = writeJob("j3", { sessionId: "OTHER", name: "keep", nameSource: "auto" });
    run({ CLAUDE_CODE_SESSION_ID: "NOPE" }, ["--label", "x"]);
    expect(readName(sp).name).toBe("keep");
  });

  it("세션 id 가 없으면 조용히 no-op 하고 exit 0", () => {
    const sp = writeJob("j4", { sessionId: "SID", name: "keep", nameSource: "auto" });
    // CLAUDE_CODE_SESSION_ID 를 비워 전달 → 실패 없이 종료해야 한다.
    expect(() => run({ CLAUDE_CODE_SESSION_ID: "" }, ["--label", "x"])).not.toThrow();
    expect(readName(sp).name).toBe("keep");
  });
});
