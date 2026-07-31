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

function writeJob(jobId, state, profileDir) {
  const base = profileDir ?? path.join(home, ".claude");
  const dir = path.join(base, "jobs", jobId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "state.json");
  fs.writeFileSync(p, JSON.stringify(state));
  return p;
}

function run(env, args) {
  // 실제 테스트 세션의 프로필 오버라이드가 새어들지 않게 지운 뒤, 각 테스트가 명시한 것만 준다.
  // (안 지우면 set-fleet-title 이 임시 HOME 대신 실제 .claude-mine 프로필을 뒤진다.)
  const base = { ...process.env, HOME: home, USERPROFILE: home };
  delete base.CLAUDE_JOB_DIR;
  delete base.CLAUDE_CONFIG_DIR;
  return execFileSync("node", [HELPER, ...args], {
    encoding: "utf8",
    env: { ...base, ...env },
  });
}

function readName(statePath) {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

describe("set-fleet-title", () => {
  it("--slug 은 하이픈을 공백으로 바꿔 작업명으로 쓴다", () => {
    const sp = writeJob("j1", { sessionId: "SID", name: "old", nameSource: "auto" });
    run({ CLAUDE_CODE_SESSION_ID: "SID" }, ["--slug", "do-next-thing"]);
    const d = readName(sp);
    expect(d.name).toBe("do next thing");
    expect(d.nameSource).toBe("user");
  });

  it("--label 은 그대로 쓰고 resumeSessionId 로도 매칭한다", () => {
    const sp = writeJob("j2", { resumeSessionId: "R1", name: "o", nameSource: "auto" });
    run({ CLAUDE_CODE_SESSION_ID: "R1" }, ["--label", "next-feature"]);
    expect(readName(sp).name).toBe("next-feature");
  });

  it("제목엔 프로젝트 약어 prefix를 붙이지 않는다(작업내역 요약만)", () => {
    const sp = writeJob("jp", { sessionId: "SID", name: "old", nameSource: "auto" });
    run({ CLAUDE_CODE_SESSION_ID: "SID" }, ["--label", "make-pr"]);
    const d = readName(sp);
    expect(d.name).toBe("make-pr");
    expect(d.name.startsWith("<")).toBe(false);
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

  it("CLAUDE_CONFIG_DIR 로 대체 프로필(.claude-mine 등)의 jobs 를 찾는다", () => {
    // .claude 하드코딩 버그의 회귀 방지: 프로필이 .claude 가 아닐 때도 현재 job 을 찾아야 한다.
    const profile = path.join(home, ".claude-mine");
    const sp = writeJob("m1", { sessionId: "SID", name: "old", nameSource: "auto" }, profile);
    run({ CLAUDE_CODE_SESSION_ID: "SID", CLAUDE_CONFIG_DIR: profile }, ["--label", "next-feature"]);
    const d = readName(sp);
    expect(d.name).toBe("next-feature");
    expect(d.nameSource).toBe("user");
  });

  it("CLAUDE_JOB_DIR 이 있으면 그 부모 jobs 디렉터리를 우선한다", () => {
    const profile = path.join(home, ".claude-mine");
    const sp = writeJob("m2", { sessionId: "SID", name: "old", nameSource: "auto" }, profile);
    run(
      { CLAUDE_CODE_SESSION_ID: "SID", CLAUDE_JOB_DIR: path.join(profile, "jobs", "m2") },
      ["--label", "kickoff"],
    );
    expect(readName(sp).name).toBe("kickoff");
  });

  it("오버라이드가 없으면 기본 프로필(~/.claude)로 떨어진다(하위호환)", () => {
    const sp = writeJob("d1", { sessionId: "SID", name: "old", nameSource: "auto" });
    run({ CLAUDE_CODE_SESSION_ID: "SID" }, ["--label", "next-feature"]);
    expect(readName(sp).name).toBe("next-feature");
  });
});
