#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findHarnessRoot, parseArgs, pathExists, readText, toPosix } from "./lib.mjs";

// `/lph-init` 엔진. 소비 프로젝트 루트(REPO_ROOT = process.cwd())에서 실행해 그
// 저장소를 LLM Project Harness "플러그인"에 적용하거나(신규), 옛 devDependency/submodule
// 설치에서 이관한다(retrofit). 하네스 엔진(scripts/harness/*.mjs)은 오직 플러그인
// (이 저장소) 안에만 있고, 소비 저장소에는 얇은 배선만 남는다:
//   - `.harness.json`        : 플러그인이 키로 삼는 루트 플래그(적용 표식 + 버전)
//   - `.claude/settings.json`: 네이티브 플러그인 활성화(마켓플레이스 + enabledPlugins)
//   - `.github/workflows/harness.yml` : CI 게이트(공용 composite action 호출)
//   - docs 스캐폴드(AGENTS.md, docs/raw/README.md, docs/wiki/index.md)
//   - (opt-in) git 훅(pre-commit·commit-msg)
//
// 멱등·retrofit-safe: 이미 있는 프로젝트 파일은 기본적으로 덮어쓰지 않는다(없을 때만
// 생성). settings.json은 파괴적 병합 없이 필요한 키만 additive로 넣고, `.harness.json`은
// 있으면 version 필드만 현재 하네스 버전으로 갱신한다.

const projectRoot = process.cwd();
const harnessRoot = findHarnessRoot();
const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args["dry-run"]);
const retrofit = Boolean(args.retrofit);
const installHooks = !args["no-git-hooks"];
const reportPath = typeof args.report === "string" ? path.resolve(projectRoot, args.report) : null;

const MARKETPLACE_NAME = "llm-project-harness";
const MARKETPLACE_REPO = "rlatndud9090/llm-project-harness";

if (sameRealPath(projectRoot, harnessRoot)) {
  fail("run this from a consuming project root, not from the harness plugin repository");
}

const operations = [];
const warnings = [];
const migrations = [];
const residuals = [];

const harnessVersion = readHarnessVersion();

migrateOldInstall();
ensureHarnessFlag();
ensureClaudeSettings();
ensureWorkflow();
ensureProjectDocs();
if (installHooks) ensureGitHooks();
reportResidualReferences();
writeReport();

printSummary();
process.exit(0);

// ─── .harness.json 루트 플래그 ───────────────────────────────────────────────
// 이 파일의 존재가 곧 "이 저장소는 하네스를 쓴다"는 표식이다. 플러그인의 SessionStart
// 훅과 모든 consumer-mode 게이트가 이 파일을 키로 삼는다. 없으면 생성하고, 있으면
// (retrofit) 나머지 필드는 보존하되 vestigial한 areas/sections는 걷어내고 version만
// 현재 하네스 버전으로 맞춘다.
function ensureHarnessFlag() {
  const flagPath = path.join(projectRoot, ".harness.json");

  if (!pathExists(flagPath)) {
    // 플래그는 "적용 표식 + 버전"만 담는다. area/section 계보는 wiki index의 `### ` 헤딩이
    // 진실이라(게이트가 거기서 파싱) 플래그에는 두지 않는다. 옛 스키마의 areas/sections는
    // 늘 빈 배열로 남아 현실과 불일치하던 vestigial 필드라 신규 플래그에서 제외한다.
    const flag = { harness: MARKETPLACE_NAME, version: harnessVersion };
    operations.push(`create .harness.json (v${harnessVersion})`);
    if (!dryRun) writeJsonFile(flagPath, flag);
    return;
  }

  let flag;
  try {
    flag = JSON.parse(fs.readFileSync(flagPath, "utf8"));
  } catch {
    operations.push("kept .harness.json (unparseable JSON)");
    warnings.push(".harness.json이 유효한 JSON이 아닙니다. version을 손으로 맞추세요.");
    return;
  }
  if (flag === null || typeof flag !== "object" || Array.isArray(flag)) {
    operations.push("kept .harness.json (unexpected shape)");
    warnings.push(".harness.json이 객체가 아닙니다. version을 손으로 맞추세요.");
    return;
  }

  if (flag.version === harnessVersion) {
    operations.push(`kept .harness.json (v${harnessVersion})`);
    return;
  }
  operations.push(`update .harness.json version ${flag.version ?? "(none)"} -> ${harnessVersion}`);
  if (!dryRun) {
    // 버전을 올리는 김에 vestigial한 areas/sections를 걷어낸다("항상 빈 배열"이 현실과
    // 불일치하는 오해를 없앤다). 그 외 소비자가 넣은 필드는 보존한다.
    const next = { ...flag, version: harnessVersion };
    delete next.areas;
    delete next.sections;
    writeJsonFile(flagPath, next);
  }
}

// ─── .claude/settings.json 네이티브 플러그인 활성화 ──────────────────────────
// 소비 저장소가 이 마켓플레이스를 알고 플러그인을 켜도록, 두 키만 additive로 넣는다:
//   extraKnownMarketplaces["llm-project-harness"] = { source: { source:"github", repo } }
//   enabledPlugins["llm-project-harness"] = true
// 그 외 키·값은 전부 보존한다(파괴적 병합 금지).
function ensureClaudeSettings() {
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  const rel = relative(settingsPath);

  const desiredMarketplace = { source: { source: "github", repo: MARKETPLACE_REPO } };

  if (!pathExists(settingsPath)) {
    const settings = {
      extraKnownMarketplaces: { [MARKETPLACE_NAME]: desiredMarketplace },
      enabledPlugins: { [MARKETPLACE_NAME]: true },
      worktree: { bgIsolation: "none" },
    };
    operations.push(`create ${rel} (marketplace + enabledPlugins + worktree)`);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      writeJsonFile(settingsPath, settings);
    }
    return;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    operations.push(`kept ${rel} (unparseable JSON)`);
    warnings.push(`${rel}이 유효한 JSON이 아닙니다. 마켓플레이스와 enabledPlugins를 손으로 병합하세요.`);
    return;
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    operations.push(`kept ${rel} (unexpected shape)`);
    warnings.push(`${rel}이 JSON 객체가 아닙니다. 마켓플레이스와 enabledPlugins를 손으로 병합하세요.`);
    return;
  }

  const marketplaces = isPlainObject(settings.extraKnownMarketplaces) ? settings.extraKnownMarketplaces : {};
  const enabled = isPlainObject(settings.enabledPlugins) ? settings.enabledPlugins : {};
  const worktree = isPlainObject(settings.worktree) ? settings.worktree : {};

  const marketplaceOk = JSON.stringify(marketplaces[MARKETPLACE_NAME]) === JSON.stringify(desiredMarketplace);
  const enabledOk = enabled[MARKETPLACE_NAME] === true;
  // 하네스 kickoff은 bg 워크트리로 격리하는데, 기본 bg 격리가 그 워크트리의 로컬
  // 상태를 떼어내면 흐름이 깨질 수 있다. bgIsolation을 "none"으로 보장하되, 이미
  // 값이 있으면(소비자가 일부러 정한 것) 존중하고 없을 때만 채운다.
  const worktreeOk = worktree.bgIsolation !== undefined;
  if (marketplaceOk && enabledOk && worktreeOk) {
    operations.push(`kept ${rel} (already wired)`);
    return;
  }

  const next = {
    ...settings,
    extraKnownMarketplaces: { ...marketplaces, [MARKETPLACE_NAME]: desiredMarketplace },
    enabledPlugins: { ...enabled, [MARKETPLACE_NAME]: true },
    worktree: { ...worktree, bgIsolation: worktree.bgIsolation ?? "none" },
  };
  operations.push(`merge ${rel} (marketplace + enabledPlugins + worktree)`);
  if (!dryRun) writeJsonFile(settingsPath, next);
}

// ─── CI 게이트 워크플로 ──────────────────────────────────────────────────────
// push/PR마다 하네스 게이트를 서버사이드에서 돌려 승인 게이트를 우회 불가능하게 만든다.
// 소비자 checkout + setup-node + 공용 composite action(rlatndud9090/llm-project-harness@main,
// action.yml)만 호출한다 — 엔진은 그 action이 태그로 fetch하므로 소비자엔 사본이 없다.
function ensureWorkflow() {
  const workflowPath = path.join(projectRoot, ".github", "workflows", "harness.yml");
  const rel = relative(workflowPath);

  // node를 하드코딩(옛 20)하면 소비 프로젝트 런타임보다 낮아 정상 코드를 오탐할 수 있다
  // (예: 신 ICU에서만 되는 Intl.NumberFormat maximumFractionDigits>20을 구 node에서 RangeError).
  // `.nvmrc`가 있으면 그 값을 따르고, 없으면 옛 버전을 못박는 대신 최신 LTS를 쓴다.
  const nvmrcPath = path.join(projectRoot, ".nvmrc");
  const setupNodeWith = pathExists(nvmrcPath)
    ? "          node-version-file: '.nvmrc'"
    : "          node-version: 'lts/*'";

  const content = `name: harness
on:
  push:
    branches: [main]
  pull_request:
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      # git-history 기반 검사(전이/불변/stage 후퇴)가 HEAD 대비 비교하므로 전체 히스토리가 필요
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
${setupNodeWith}
      - uses: ${MARKETPLACE_REPO}@main
`;

  if (pathExists(workflowPath)) {
    const existing = readText(workflowPath);
    if (existing.includes(`${MARKETPLACE_REPO}@`)) {
      operations.push(`kept ${rel} (already plugin CI)`);
      return;
    }
    // 옛 devDependency 모델 워크플로(`npm run harness:gate`/`.harness/scripts` 참조)는
    // 삭제된 `.harness` 마운트를 가리켜 CI가 깨진다. 하네스 CI로 식별되면 composite
    // action 버전으로 교체한다(마이그레이션). 하네스로 안 보이는 커스텀 워크플로는 보존.
    if (existing.includes("harness:gate") || existing.includes(".harness/scripts")) {
      operations.push(`migrate ${rel} (old harness CI → composite action)`);
      migrations.push(`replace old ${rel} (npm run harness:gate → uses: ${MARKETPLACE_REPO})`);
      if (!dryRun) fs.writeFileSync(workflowPath, content, "utf8");
      return;
    }
    operations.push(`kept ${rel} (non-harness workflow)`);
    warnings.push(`${rel}이 이미 있고 하네스 CI로 보이지 않습니다. 플러그인 CI가 필요하면 "- uses: ${MARKETPLACE_REPO}@<tag>" 스텝을 직접 추가하세요.`);
    return;
  }

  operations.push(`create ${rel}`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
    fs.writeFileSync(workflowPath, content, "utf8");
  }
}

// ─── 프로젝트 소유 docs 스캐폴드 ─────────────────────────────────────────────
// 없을 때만 생성한다. 위키 index는 하네스 템플릿에서 seed한다. retrofit이면 기존
// AGENTS.md/위키는 덮어쓰지 않고 marker block만 upsert한다(프로젝트 소유 보존).
function ensureProjectDocs() {
  ensureDirectory(path.join(projectRoot, "docs", "raw"));
  ensureDirectory(path.join(projectRoot, "docs", "wiki"));

  ensureFileOrMarker(
    path.join(projectRoot, "docs", "wiki", "index.md"),
    readHarnessTemplate("wiki", "index.md"),
    "LLM-HARNESS:WIKI",
    // marker는 포인터만 넣고 작성 규칙 본문은 복사하지 않는다(위키에는 프로젝트 방향성 +
    // 계보 링크만). sentinel-free라 harness:check의 authoring-guidance leak 게이트에 안 걸린다.
    `이 위키에는 프로젝트 방향성과 raw unit 계보 링크만 둡니다. 위키 구조·영역(area)/섹션(section)
작성 규칙은 하네스 플러그인의 harness/protocols/wiki-ingest.md를 참고하세요(이 안내는 규칙 본문을
위키에 복사하지 않습니다).
`,
  );

  ensureFile(
    path.join(projectRoot, "docs", "raw", "README.md"),
    `# Raw Sources

이 디렉터리는 이 프로젝트의 raw PRD/ADR/notes를 저장한다.
공용 템플릿·작성 규칙은 LLM Project Harness 플러그인이 제공한다.
`,
  );

  ensureFileOrMarker(
    path.join(projectRoot, "AGENTS.md"),
    `# Project Agent Guide

This project adopts the shared LLM Project Harness as a Claude Code plugin
(enabled in \`.claude/settings.json\`; the \`.harness.json\` flag marks adoption).
Answer in Korean by default unless the user asks otherwise.

## Project Intent

TODO: describe this product.

## Harness Entry Points

1. Read \`docs/wiki/index.md\` first when starting project work.
2. The harness plugin injects the shared session-start protocol at session start.
3. Follow only raw links relevant to the task.
4. Use \`/${MARKETPLACE_NAME}:next-feature\` for open-ended product work.
5. Keep product-specific decisions in this project's \`docs/raw/\` and \`docs/wiki/\`.

The shared harness workflow (PRD/ADR, raw/wiki, approval gate, commit protocol) is
provided entirely by the plugin — there is no local engine copy to maintain.
`,
    "LLM-HARNESS",
    `## LLM Project Harness

This project adopts the shared LLM Project Harness as a Claude Code plugin.

- Read \`docs/wiki/index.md\` first when starting project work.
- The plugin provides the shared session-start protocol, skills, and commands.
- Keep project-specific decisions in this project's \`docs/raw/\` and \`docs/wiki/\`.
- Adoption is marked by the \`.harness.json\` flag at the repo root.
`,
  );
}

// ─── git 훅 설치(opt-in) ─────────────────────────────────────────────────────
// `${CLAUDE_PLUGIN_ROOT}`은 Claude Code 세션 밖에서는 정의되지 않으므로, 훅 본문에는
// init 시점에 해석한 플러그인 절대경로를 구워 넣는다. 기존 훅은 marker로 식별해
// 비파괴로 갱신하고, 하네스가 아닌 훅이 이미 있으면 덮지 않고 경고만 남긴다
// (install-hooks.mjs의 provider-mode 규약과 동일). git 저장소가 아니면 건너뛴다.
function ensureGitHooks() {
  let hooksDir;
  try {
    hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    warnings.push("git 저장소가 아니라 훅 설치를 건너뜁니다(--no-git-hooks와 동일). git init 후 /lph-init을 다시 실행하세요.");
    return;
  }
  const absoluteHooksDir = path.resolve(projectRoot, hooksDir);
  if (!dryRun) fs.mkdirSync(absoluteHooksDir, { recursive: true });

  const checkScript = path.join(harnessRoot, "scripts", "harness", "artifact-check.mjs");
  const verifyMsgScript = path.join(harnessRoot, "scripts", "harness", "verify-commit-msg.mjs");
  installHook(absoluteHooksDir, "pre-commit", `node "${checkScript}"`);
  installHook(absoluteHooksDir, "commit-msg", `node "${verifyMsgScript}" "$1"`);
}

function installHook(hooksDir, name, command) {
  const marker = `llm-project-harness ${name}`;
  const hookPath = path.join(hooksDir, name);
  const rel = relative(hookPath);
  const body = `#!/bin/sh
# >>> ${marker} >>>
# Installed by /lph-init (scripts/harness/init.mjs).
# Remove this file to opt out.
${command}
# <<< ${marker} <<<
`;

  if (!pathExists(hookPath)) {
    operations.push(`install ${rel}`);
    writeHook(hookPath, body);
    return;
  }
  if (readText(hookPath).includes(marker)) {
    operations.push(`update ${rel}`);
    writeHook(hookPath, body);
    return;
  }
  operations.push(`kept ${rel} (non-harness hook)`);
  warnings.push(`기존 ${name} 훅이 있어 덮지 않았습니다. \`${command}\`를 직접 이어 붙이거나 훅을 비우고 다시 실행하세요.`);
}

function writeHook(hookPath, body) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, body, "utf8");
  fs.chmodSync(hookPath, 0o755);
}

// ─── 옛 설치 이관 ────────────────────────────────────────────────────────────
// devDependency/submodule 시대의 소비자를 매끄럽게 옮긴다. 아래가 있으면 되돌린다
// (dry-run 준수): `.harness` 심볼릭 링크, package.json의 llm-project-harness
// devDependency + link.mjs를 부르는 postinstall, `.harness-sync` 파일, 옛 하네스
// 마운트(.harness/node_modules)를 가리키던 `.codex/`·`.claude/` 어댑터 심볼릭 링크.
// 실제 로컬 파일은 절대 건드리지 않는다(심볼릭 링크만, 그것도 옛 마운트를 가리킬 때만).
function migrateOldInstall() {
  // 1) `.harness` 심볼릭 링크(옛 마운트)
  const harnessLink = path.join(projectRoot, ".harness");
  if (isSymlink(harnessLink)) {
    migrations.push("remove .harness symlink (old mount)");
    if (!dryRun) fs.rmSync(harnessLink, { force: true });
  }

  // 2) package.json: llm-project-harness devDependency + link.mjs postinstall 제거
  const packagePath = path.join(projectRoot, "package.json");
  if (pathExists(packagePath)) {
    let pkg = null;
    try {
      pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    } catch {
      warnings.push("package.json이 유효한 JSON이 아니라 devDependency/postinstall 이관을 건너뜁니다.");
    }
    if (pkg && typeof pkg === "object") {
      let changed = false;
      for (const depKey of ["devDependencies", "dependencies"]) {
        if (isPlainObject(pkg[depKey]) && pkg[depKey][MARKETPLACE_NAME] !== undefined) {
          delete pkg[depKey][MARKETPLACE_NAME];
          migrations.push(`strip ${depKey}.${MARKETPLACE_NAME} from package.json`);
          changed = true;
        }
      }
      if (isPlainObject(pkg.scripts)) {
        // 옛 엔진 마운트를 가리키던 하네스 스크립트(harness:check/kickoff/gate/…)와 link.mjs
        // postinstall을 걷어낸다. 마운트는 devDep 시대엔 `node_modules/llm-project-harness`,
        // submodule/심볼릭 시대엔 `.harness/scripts/` 둘 다 있었으니 양쪽을 잡는다. 플러그인
        // 모델에선 소비자가 하네스 npm 스크립트를 두지 않는다(세션은 플러그인 스킬, CI는
        // composite action). 그대로 두면 죽은 경로를 가리켜 실행 시 깨진다.
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          if (typeof cmd !== "string") continue;
          if (
            cmd.includes(".harness/scripts/") ||
            cmd.includes(`node_modules/${MARKETPLACE_NAME}`) ||
            (name === "postinstall" && cmd.includes("link.mjs"))
          ) {
            delete pkg.scripts[name];
            migrations.push(`strip package.json script "${name}" (옛 하네스 엔진 마운트 참조)`);
            changed = true;
          }
        }
      }
      if (changed && !dryRun) writeJsonFile(packagePath, pkg);
    }
  }

  // 2b) lockfile 정합. package.json에서 devDep을 지워도 lockfile에 harness 항목이 남으면
  //     `npm ci`(엄격 설치, action.yml이 lockfile 있으면 이걸 씀)가 즉시 실패한다
  //     ("lock file does not satisfy package.json"). package-lock은 직접 걷어내고
  //     (오프라인·결정적), pnpm/yarn lock은 포맷이 달라 재생성만 안내한다.
  syncLockfiles();

  // 3) `.harness-sync` 파일(옛 동기화 원장)
  const syncFile = path.join(projectRoot, ".harness-sync");
  if (pathExists(syncFile)) {
    migrations.push("remove .harness-sync (old sync marker)");
    if (!dryRun) fs.rmSync(syncFile, { force: true });
  }

  // 4) 옛 마운트를 가리키던 어댑터 심볼릭 링크만 정리
  const adapterDirs = [
    [".codex", "agents"],
    [".codex", "skills"],
    [".claude", "agents"],
    [".claude", "commands"],
    [".claude", "skills"],
  ];
  for (const [toolDir, childDir] of adapterDirs) {
    const dir = path.join(projectRoot, toolDir, childDir);
    if (!pathExists(dir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const link = path.join(dir, entry.name);
      if (!pointsAtOldMount(link)) continue;
      migrations.push(`remove old adapter symlink ${relative(link)}`);
      if (!dryRun) fs.rmSync(link, { force: true });
    }
  }
}

// 옛 하네스 devDependency가 남긴 lockfile 잔재를 걷어낸다. package.json에서 devDep을
// 지워도 lockfile이 그대로면 manifest↔lock 불일치라 `npm ci`가 실패한다. package-lock은
// v1(legacy `dependencies` 트리)·v2/v3(`packages` 맵 + 루트 매니페스트 미러)를 모두 훑어
// 직접 제거하고(오프라인·결정적), pnpm/yarn lock은 재생성만 안내한다.
function syncLockfiles() {
  const lockPath = path.join(projectRoot, "package-lock.json");
  if (pathExists(lockPath)) {
    let lock = null;
    try {
      lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    } catch {
      warnings.push("package-lock.json이 유효한 JSON이 아니라 lockfile 동기화를 건너뜁니다. `npm install`로 재생성하세요.");
    }
    if (isPlainObject(lock)) {
      let changed = false;
      // v1(legacy) 트리
      if (isPlainObject(lock.dependencies) && lock.dependencies[MARKETPLACE_NAME] !== undefined) {
        delete lock.dependencies[MARKETPLACE_NAME];
        changed = true;
      }
      // v2/v3 packages 맵: 설치 엔트리 + 루트("") 매니페스트 미러
      if (isPlainObject(lock.packages)) {
        const nodeKey = `node_modules/${MARKETPLACE_NAME}`;
        if (lock.packages[nodeKey] !== undefined) {
          delete lock.packages[nodeKey];
          changed = true;
        }
        const rootPkg = lock.packages[""];
        if (isPlainObject(rootPkg)) {
          for (const depKey of ["devDependencies", "dependencies"]) {
            if (isPlainObject(rootPkg[depKey]) && rootPkg[depKey][MARKETPLACE_NAME] !== undefined) {
              delete rootPkg[depKey][MARKETPLACE_NAME];
              changed = true;
            }
          }
        }
      }
      if (changed) {
        migrations.push("strip llm-project-harness from package-lock.json (npm ci 정합)");
        if (!dryRun) writeJsonFile(lockPath, lock);
      }
    }
  }

  // pnpm/yarn lock은 포맷이 달라 파싱하지 않고 재생성만 안내한다(안 하면 frozen/ci 설치 실패).
  for (const [file, cmd] of [
    ["pnpm-lock.yaml", "pnpm install"],
    ["yarn.lock", "yarn install"],
  ]) {
    const lock = path.join(projectRoot, file);
    if (pathExists(lock) && readText(lock).includes(MARKETPLACE_NAME)) {
      warnings.push(`${file}에 ${MARKETPLACE_NAME} 항목이 남아 있습니다. \`${cmd}\`로 lockfile을 재생성하세요(안 하면 frozen/ci 설치가 실패).`);
    }
  }
}

// 심볼릭 링크이고, 그 타겟(문자열)이 옛 하네스 마운트를 가리킬 때만 true. 실제
// 파일(프로젝트가 손으로 둔 로컬 override)은 심볼릭 링크가 아니므로 절대 걸리지 않는다.
function pointsAtOldMount(link) {
  let raw;
  try {
    if (!fs.lstatSync(link).isSymbolicLink()) return false;
    raw = fs.readlinkSync(link);
  } catch {
    return false;
  }
  const target = toPosix(raw);
  return target.includes(".harness/") || target.includes(`node_modules/${MARKETPLACE_NAME}`);
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function readHarnessVersion() {
  try {
    const pluginJson = JSON.parse(fs.readFileSync(path.join(harnessRoot, ".claude-plugin", "plugin.json"), "utf8"));
    if (typeof pluginJson.version === "string" && pluginJson.version) return pluginJson.version;
  } catch {
    // fall through
  }
  fail("could not read harness version from the plugin's .claude-plugin/plugin.json");
}

function readHarnessTemplate(...parts) {
  return fs.readFileSync(path.join(harnessRoot, "harness", "templates", ...parts), "utf8");
}

function ensureDirectory(directory) {
  if (pathExists(directory)) return;
  operations.push(`mkdir ${relative(directory)}`);
  if (!dryRun) fs.mkdirSync(directory, { recursive: true });
}

function ensureFile(filePath, content) {
  if (pathExists(filePath)) {
    operations.push(`kept ${relative(filePath)}`);
    return;
  }
  operations.push(`create ${relative(filePath)}`);
  if (dryRun) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function ensureFileOrMarker(filePath, content, markerName, markerContent) {
  if (!pathExists(filePath)) {
    ensureFile(filePath, content);
    return;
  }
  if (!retrofit) {
    operations.push(`kept ${relative(filePath)}`);
    return;
  }
  const current = fs.readFileSync(filePath, "utf8");
  const next = upsertMarkerBlock(current, markerName, markerContent);
  if (next === current) {
    operations.push(`kept ${relative(filePath)} marker ${markerName}`);
    return;
  }
  operations.push(`update ${relative(filePath)} marker ${markerName}`);
  if (!dryRun) fs.writeFileSync(filePath, next, "utf8");
}

function upsertMarkerBlock(content, markerName, markerContent) {
  const start = `<!-- ${markerName}:START -->`;
  const end = `<!-- ${markerName}:END -->`;
  const block = `${start}\n${markerContent.trim()}\n${end}`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (pattern.test(content)) return content.replace(pattern, block);
  return `${content.trimEnd()}\n\n${block}\n`;
}

// 이관 후 소비 트리에 남은 옛 마운트(.harness)/제거된 harness:* 스크립트 참조를 스캔해
// "수동 후속" 체크리스트로 보고한다. 절대 자동 수정하지 않는다 — 라이브 README·런북·설정·
// 프로즈·스킬 지시라 무엇을 어떻게 고칠지는 문맥 판단이 필요하다. 핵심 함정(A5): docs/raw/**
// 는 append-only 이력이라 당시 사실인 .harness 언급을 그대로 두는 게 정답이므로 반드시
// 제외한다. tracked 파일만 본다(git ls-files) — init이 방금 쓴 배선은 아직 untracked라
// 자기 자신을 오탐하지 않고, 소비자가 이미 커밋해 둔 잔재만 드러난다. dry-run에서도 돈다
// (적용 전에 수동 범위를 미리 보여주는 C2 프리뷰).
function reportResidualReferences() {
  let tracked;
  try {
    tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return; // git 저장소가 아니거나 git이 없으면 스윕할 것이 없다
  }

  // 옛 마운트: `.harness/`(경로) 또는 bare `.harness`(예: .gitignore 항목). 단 `.harness.json`
  // (뒤에 `.`)·`.harness-sync`(뒤에 `-`) 같은 현행/전용 토큰은 negative lookahead로 제외한다.
  const mountRe = /\.harness(?![.\w-])/;
  // 제거된 하네스 npm 스크립트 이름(값에 남은 `npm run harness:gate` 같은 caller도 잡힌다).
  const scriptRe = /\bharness:(kickoff|ingest|check|sync|gate|hooks|approve)\b/;

  for (const rel of tracked) {
    if (rel.startsWith("docs/raw/")) continue; // A5: 불변 이력 제외
    const abs = path.join(projectRoot, rel);
    let text;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile() || stat.size > 512 * 1024) continue; // 심볼릭/대용량/바이너리 회피
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue; // 바이너리
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (mountRe.test(lines[i]) || scriptRe.test(lines[i])) {
        residuals.push(`${rel}:${i + 1}`);
      }
    }
  }
}

function writeReport() {
  if (!reportPath) return;
  operations.push(`${dryRun ? "would write" : "write"} report ${relative(reportPath)}`);
  if (dryRun) return;

  const content = [
    "# Harness Init Report",
    "",
    `- Mode: ${retrofit ? "retrofit" : "init"}${dryRun ? " (dry-run)" : ""}`,
    `- Harness version: ${harnessVersion}`,
    "",
    "## Operations",
    "",
    ...(operations.length ? operations.map((op) => `- ${op}`) : ["- None"]),
    "",
    "## Migrations",
    "",
    ...(migrations.length ? migrations.map((m) => `- ${m}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(warnings.length ? warnings.map((w) => `- ${w}`) : ["- None"]),
    "",
    "## Residual references (manual followup)",
    "",
    "> 이관 후에도 tracked 파일에 남은 옛 `.harness` 마운트/`harness:*` 스크립트 참조입니다. " +
      "init은 자동 수정하지 않습니다(라이브 README·런북·설정·프로즈·스킬 지시라 문맥 판단 필요). " +
      "`docs/raw/**`는 불변 이력이라 의도적으로 제외했습니다.",
    "",
    ...(residuals.length ? residuals.map((r) => `- ${r}`) : ["- None"]),
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, content, "utf8");
}

function printSummary() {
  const mode = retrofit ? "retrofit" : "init";
  if (dryRun) {
    console.log(`[harness:init] ${mode} dry-run — 적용될 변경:`);
  } else {
    console.log(`[harness:init] ${mode} 완료 (하네스 v${harnessVersion}).`);
  }
  for (const op of operations) console.log(`- ${op}`);
  for (const m of migrations) console.log(`- 이관: ${m}`);
  for (const w of warnings) console.log(`- 경고: ${w}`);
  if (residuals.length > 0) {
    console.log("- 잔존 참조(수동 후속 필요, 자동 수정 안 함; docs/raw/**는 의도적으로 제외):");
    for (const r of residuals) console.log(`  · ${r}`);
  }
  if (!dryRun) {
    console.log("다음: /plugin marketplace add rlatndud9090/llm-project-harness 로 마켓플레이스를 등록하고 플러그인을 활성화하세요.");
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSymlink(filePath) {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

function sameRealPath(left, right) {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
}

function relative(filePath) {
  return toPosix(path.relative(projectRoot, filePath)) || ".";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(`[harness:init] ${message}`);
  process.exit(1);
}
