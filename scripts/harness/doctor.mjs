#!/usr/bin/env node
// `/lph-doctor` 엔진. 소비 프로젝트 루트(REPO_ROOT = process.cwd())에서 실행해 하네스
// 정합 상태를 진단한다: 이 프로젝트가 마지막으로 정합한 버전(`.harness.json`의 version)과
// 설치된 플러그인 버전(`.claude-plugin/plugin.json`)을 비교하고, 그 사이에 낀 버전의 소비자
// 정합 조치(`harness/reconcile.md`)를 골라 제시한다. 진단 도구이므로 항상 exit 0로 끝난다
// (게이트가 아니다 — 스킬/에이전트가 출력을 읽고 /lph-init 재실행 등 조치를 오케스트레이션한다).
import {
  compareVersions,
  harnessPath,
  isHarnessRepository,
  pathExists,
  readPluginVersion,
  readText,
  repoPath,
} from "./lib.mjs";

const pluginVersion = readPluginVersion();

// Provider repo doesn't adopt itself (no .harness.json). Doctor targets consumers.
if (isHarnessRepository()) {
  console.log("[lph-doctor] status=provider");
  console.log(`- 이 저장소는 하네스 provider입니다(플러그인 v${pluginVersion ?? "?"}). doctor는 소비 프로젝트에서 실행합니다.`);
  console.log("- 소비 프로젝트에서 /lph-doctor를 실행해 버전 정합을 진단하세요.");
  process.exit(0);
}

// ─── 소비자 마지막 정합 버전 ────────────────────────────────────────────────
const flagPath = repoPath(".harness.json");
let lastSynced = null;
let flagState = "missing";
if (pathExists(flagPath)) {
  try {
    const flag = JSON.parse(readText(flagPath));
    if (flag && typeof flag === "object" && typeof flag.version === "string" && flag.version) {
      lastSynced = flag.version;
      flagState = "ok";
    } else {
      flagState = "no-version";
    }
  } catch {
    flagState = "malformed";
  }
}

function emit(status, lines) {
  console.log(`[lph-doctor] status=${status}`);
  for (const line of lines) console.log(line);
}

// ─── uninitialized: 아직 한 번도 정합 안 됨 → /lph-init ──────────────────────
if (lastSynced === null) {
  const why =
    flagState === "missing"
      ? ".harness.json 플래그가 없습니다(이 레포는 아직 하네스를 적용하지 않았습니다)."
      : flagState === "malformed"
        ? ".harness.json이 유효한 JSON이 아닙니다."
        : ".harness.json에 version 필드가 없습니다.";
  emit("uninitialized", [
    `- ${why}`,
    `- 설치된 플러그인: v${pluginVersion ?? "(읽기 실패)"}`,
    "- 권장: /lph-init 을 실행해 배선을 심고 마지막 정합 버전을 기록하세요(먼저 --dry-run).",
    "  (마켓플레이스 미등록이면: /plugin marketplace add rlatndud9090/llm-project-harness 먼저)",
  ]);
  process.exit(0);
}

// ─── 플러그인 버전을 못 읽으면 비교 불가 ────────────────────────────────────
if (pluginVersion === null) {
  emit("undecidable", [
    `- 마지막 정합: v${lastSynced}`,
    "- 설치된 플러그인 버전을 읽지 못했습니다(.claude-plugin/plugin.json). 플러그인 설치를 확인하세요.",
  ]);
  process.exit(0);
}

const cmp = compareVersions(pluginVersion, lastSynced); // 1: plugin newer(behind), 0: fresh, -1: ahead, null: undecidable

if (cmp === null) {
  emit("undecidable", [
    `- 마지막 정합: v${lastSynced} · 설치된 플러그인: v${pluginVersion}`,
    "- 두 버전을 dotted-numeric으로 비교할 수 없습니다(프리릴리스 태그 등). 수동 확인하세요.",
  ]);
  process.exit(0);
}

if (cmp === 0) {
  emit("fresh", [
    `- 마지막 정합 == 설치된 플러그인: v${pluginVersion}. 정합 상태입니다.`,
    "- (선택) 산출물 게이트 재확인: /artifact-validation (또는 sh .git/hooks/pre-commit).",
  ]);
  process.exit(0);
}

if (cmp === -1) {
  emit("ahead", [
    `- 마지막 정합: v${lastSynced} > 설치된 플러그인: v${pluginVersion}.`,
    "- 이 레포 배선이 설치된 플러그인보다 앞섭니다. 플러그인을 갱신하세요:",
    "  /plugin marketplace update llm-project-harness",
  ]);
  process.exit(0);
}

// ─── behind: 버전 범프 감지 → 그 사이 정합 조치 제시 ─────────────────────────
const ledgerPath = harnessPath("harness", "reconcile.md");
const entries = pathExists(ledgerPath) ? parseReconcile(readText(ledgerPath)) : [];
// (lastSynced, pluginVersion] 구간의 항목만.
const applicable = entries.filter((e) => {
  const gtSynced = compareVersions(e.version, lastSynced);
  const lePlugin = compareVersions(e.version, pluginVersion);
  return gtSynced === 1 && (lePlugin === 0 || lePlugin === -1);
});

const wiringNeeded = applicable.some((e) => e.bullets.some((b) => b.startsWith("- (배선)")));
const artifactActions = applicable.flatMap((e) =>
  e.bullets.filter((b) => b.startsWith("- (산출물)")).map((b) => `  [v${e.version}] ${b}`),
);

const lines = [
  `- 마지막 정합: v${lastSynced} → 설치된 플러그인: v${pluginVersion} (버전 범프 감지).`,
  `- 정합 조치 (v${lastSynced} 이후 ~ v${pluginVersion}):`,
];
if (applicable.length === 0) {
  lines.push("  (reconcile 원장에 해당 구간 항목이 없습니다 — 안전상 /lph-init 재실행을 권장합니다.)");
} else {
  for (const e of applicable) {
    lines.push(`  ## ${e.version}`);
    for (const b of e.bullets) lines.push(`  ${b}`);
  }
}
lines.push("");
if (wiringNeeded || applicable.length === 0) {
  lines.push("- 권장(배선): /lph-init 재실행 → 훅 재-bake·.harness.json version 갱신(먼저 --dry-run). 재실행 후 /lph-doctor가 status=fresh면 완료.");
}
if (artifactActions.length) {
  lines.push("- 권장(산출물, 프로젝트가 손으로 반영):");
  for (const a of artifactActions) lines.push(a);
}
emit("behind", lines);
process.exit(0);

// ─── reconcile.md 파서 ──────────────────────────────────────────────────────
// `## <x.y.z>` 헤딩과 그 아래 `- (…)` 불릿(줄바꿈된 연속 줄은 이어붙임)을 수집한다.
// 다른 헤딩(`#`~`######`)이나 `---`를 만나면 현재 버전 블록을 닫는다.
function parseReconcile(text) {
  const entries = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    const h = /^##\s+(\d+\.\d+\.\d+)\s*$/.exec(trimmed);
    if (h) {
      cur = { version: h[1], bullets: [] };
      entries.push(cur);
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed) || trimmed === "---") {
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (/^-\s+/.test(trimmed)) {
      cur.bullets.push(trimmed);
    } else if (trimmed && cur.bullets.length) {
      cur.bullets[cur.bullets.length - 1] += ` ${trimmed}`;
    }
  }
  return entries;
}
