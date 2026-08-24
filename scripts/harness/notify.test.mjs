import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "notify.mjs");

function run(projectDir) {
  return execFileSync("node", [HOOK], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: "utf8",
  });
}

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "notify-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("notify.mjs (Notification hook)", () => {
  it("emits a BEL terminalSequence when the project has adopted the harness", () => {
    fs.writeFileSync(path.join(dir, ".harness.json"), '{"harness":"llm-project-harness","version":"0.0.0"}');
    const out = run(dir);
    const parsed = JSON.parse(out);
    expect(Object.keys(parsed)).toEqual(["terminalSequence"]);
    // 값은 정확히 BEL 한 글자여야 한다(터미널 벨을 울리는 지원 필드).
    expect(parsed.terminalSequence).toHaveLength(1);
    expect(parsed.terminalSequence.charCodeAt(0)).toBe(7);
  });

  it("is a silent no-op outside a harness project (no .harness.json)", () => {
    expect(run(dir)).toBe("");
  });

  it("keeps the BEL as an escape literal in source, never a raw control byte", () => {
    // raw 제어문자가 소스에 박히면 편집기·git·검색에서 조용히 깨진다(과거 raw NUL/BEL 함정).
    // BEL 은 런타임에만 존재하고 소스에는 \\u0007 이스케이프로만 있어야 한다.
    const bytes = fs.readFileSync(HOOK);
    const hasRawControl = bytes.some((b) => b < 0x09 || (b > 0x0d && b < 0x20));
    expect(hasRawControl).toBe(false);
  });
});
