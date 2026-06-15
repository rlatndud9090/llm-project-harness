import { afterEach, describe, expect, it } from "vitest";
import {
  FORBIDDEN_STATUS_TRANSITIONS,
  isForbiddenTransition,
  parseFrontmatter,
  parseWorkBranch,
  resolveTimezone,
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
    expect(isForbiddenTransition("chore.md", "done", "draft")).toBe(true);
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
  });
});

describe("toPosix", () => {
  it("keeps posix separators intact", () => {
    expect(toPosix("docs/raw/feature/x")).toBe("docs/raw/feature/x");
  });
});
