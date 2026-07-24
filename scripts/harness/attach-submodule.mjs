#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const args = parseArgs(process.argv.slice(2));
const harnessRoot = path.resolve(projectRoot, args["harness-dir"] ?? autoHarnessRoot(scriptPath));
const dryRun = Boolean(args["dry-run"]);
const force = Boolean(args.force);
const retrofit = Boolean(args.retrofit);
const prune = !args["no-prune"];
const jsonOutput = Boolean(args.json);
const reportPath = typeof args.report === "string" ? path.resolve(projectRoot, args.report) : null;
const updatePackageScripts = !args["no-package-scripts"];
const writeClaudeSettings = !args["no-claude-settings"];
// 환경 진단 opt-out. 플래그는 사람이, `HARNESS_SKIP_ENV_CHECK`는 자동화가 쓴다
// (테스트 픽스처는 임시 디렉터리에서 돌아 호스트의 git 전역 설정을 그대로 상속하므로,
// 그 값에 따라 통과/실패가 갈리면 안 된다. `HARNESS_SKIP_REMOTE_CHECK`와 같은 규약이다).
const checkEnvironment = !args["no-env-check"] && process.env.HARNESS_SKIP_ENV_CHECK !== "1";

if (sameRealPath(projectRoot, harnessRoot)) {
  fail("run this from a consuming project root, not from the harness repository root");
}

if (!exists(path.join(harnessRoot, "harness", "protocols"))) {
  fail(`harness root does not look valid: ${harnessRoot}`);
}

const operations = [];
const warnings = [];
const conflicts = [];

const ADAPTER_DIRS = [
  [".codex", "agents"],
  [".codex", "skills"],
  [".claude", "agents"],
  [".claude", "commands"],
  [".claude", "skills"],
];
const PRUNE_ADAPTER_DIRS = [...ADAPTER_DIRS, [".agents", "skills"]];

// 소비 프로젝트가 EOL을 직접 못박게 한다. `.gitattributes`의 `eol=lf`는
// `core.autocrlf`를 이기므로, Git for Windows의 시스템 기본값(autocrlf=true)이 뭐든
// 워킹트리는 LF로 체크아웃된다. 하네스의 검사는 대부분 줄 단위 문자열 매칭이라
// CR 한 글자가 "frontmatter 없음" 같은 대량 오탐과, 승인 경로에서는 실제 파일
// 손상까지 만든다 — 그 유입을 원천에서 끊는 예방책이다.
const GITATTRIBUTES_CONTENT = `* text=auto eol=lf

# 텍스트 변환 대상에서 제외한다. text=auto의 자동 감지만으로도 대개 동작하지만,
# 이미지가 많은 저장소에서 오탐 한 번이 곧 자산 손상이므로 명시해 둔다.
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
*.ico binary
*.pdf binary
*.woff binary
*.woff2 binary
*.ttf binary
*.otf binary
*.zip binary
*.gz binary
*.mp4 binary
*.webm binary
`;

const environment = inspectAdapterEnvironment();
if (environment.blockers.length > 0) blockOrWarn(environment);

for (const [toolDir, childDir] of ADAPTER_DIRS) linkChildren(toolDir, childDir);
for (const [toolDir, childDir] of PRUNE_ADAPTER_DIRS) pruneStaleLinks(toolDir, childDir);
if (prune) pruneEmptyLegacyAdapterDirs();

ensureProjectDocs();
ensureGitAttributes();
ensureSyncFile();
if (writeClaudeSettings) ensureClaudeSettings();
if (updatePackageScripts) ensurePackageScripts();
writeReport();

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        mode: retrofit ? "retrofit" : "attach",
        dryRun,
        prune,
        environment,
        operations,
        warnings,
        conflicts,
      },
      null,
      2,
    ),
  );
} else if (dryRun) {
  for (const operation of operations) console.log(`[dry-run] ${operation}`);
  printDiagnostics();
  console.log(`[attach-submodule] ${retrofit ? "retrofit " : ""}dry run complete`);
} else {
  console.log(`[attach-submodule] ${retrofit ? "retrofit " : ""}ok`);
  for (const operation of operations) console.log(`- ${operation}`);
  printDiagnostics();
}

// Windows에서 어댑터가 "조용히" 무너지는 경로는 둘이다.
//
// (1) git이 symlink를 만들지 못하면 — `core.symlinks=false`는 Git for Windows가
//     시스템 gitconfig에 심어서 배포하는 기본값이다 — 링크 대신 **타겟 경로가 적힌
//     한 줄짜리 텍스트 파일**이 체크아웃된다. 인덱스와 내용이 일치하므로
//     `git status`는 깨끗하고, 어디에서도 경고가 뜨지 않는다. 소비 프로젝트에는
//     "하네스 스킬이 그냥 안 보인다"로만 나타나서 원인을 찾기가 매우 어렵다.
// (2) 개발자 모드가 꺼진 Windows에서는 `fs.symlinkSync` 자체가 EPERM으로 죽는다.
//     그대로 두면 앞쪽 몇 개만 링크된 절반 장착 상태가 남는다.
//
// 두 경우 다 첫 symlink를 만들기 전에 잡아야 의미가 있다. 그래서 링크 루프보다
// 먼저 돌고, 고치는 방법까지 붙여서 멈춘다(`--no-env-check`로 끌 수 있다).
function inspectAdapterEnvironment() {
  if (!checkEnvironment) {
    return { checked: false, blockers: [], symlinks: null, autocrlf: null, probe: null };
  }

  const symlinks = gitConfigEntry("core.symlinks");
  const autocrlf = gitConfigEntry("core.autocrlf");
  const probe = probeSymlinkCreation();
  const blockers = [];

  if (symlinks && /^false$/i.test(symlinks.value)) {
    blockers.push(
      `git core.symlinks=false (출처: ${symlinks.origin ?? "unknown"}) — git이 어댑터 symlink를 링크 대신 경로가 적힌 텍스트 파일로 체크아웃한다.`,
    );
  }
  if (probe && !probe.ok) {
    blockers.push(`이 환경에서 symlink를 만들 수 없다 (${probe.code}) — 어댑터 링크 생성이 실패한다.`);
  }

  // autocrlf는 어댑터를 깨뜨리지는 않지만 CRLF 워킹트리를 만들고, 그러면 하네스의
  // frontmatter 파싱이 전부 오판한다. `.gitattributes`를 심어 재발은 막지만 이미
  // CRLF로 체크아웃된 파일은 되돌려야 하므로, 차단 대신 조치와 함께 경고만 남긴다.
  if (autocrlf && /^true$/i.test(autocrlf.value)) {
    warnings.push(
      `git core.autocrlf=true (출처: ${autocrlf.origin ?? "unknown"}): 워킹트리가 CRLF로 체크아웃된다. ` +
        `이 프로젝트에 심는 .gitattributes가 이후 체크아웃을 LF로 고정하지만, 이미 CRLF인 파일은 ` +
        `\`git config --unset core.autocrlf\` 후 \`git rm --cached -rq . && git reset --hard\`로 되돌려야 한다.`,
    );
  }

  return { checked: true, blockers, symlinks, autocrlf, probe };
}

// dry-run은 아무것도 만들지 않으므로 진단만 싣고 계속 간다(무엇이 문제인지 보여주는
// 것이 dry-run의 목적이다). 실제 장착일 때만 멈춘다 — 절반만 링크된 상태로 끝나는
// 것이 최악이기 때문이다.
function blockOrWarn(env) {
  if (dryRun) {
    for (const blocker of env.blockers) warnings.push(blocker);
    return;
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ mode: retrofit ? "retrofit" : "attach", blocked: true, environment: env }, null, 2));
    process.exit(1);
  }

  console.error("[attach-submodule] 어댑터 symlink를 만들 수 없는 환경입니다. 아무것도 바꾸지 않고 중단합니다.");
  for (const blocker of env.blockers) console.error(`- ${blocker}`);
  for (const line of symlinkRemediation(env.symlinks)) console.error(line);
  console.error("- 환경 검사를 건너뛰려면 --no-env-check (권장하지 않음: 어댑터가 조용히 텍스트 파일이 된다)");
  process.exit(1);
}

function symlinkRemediation(symlinksEntry) {
  const steps = [
    "Windows 개발자 모드를 켠다: 설정 > 개인 정보 및 보안 > 개발자용 > 개발자 모드 (관리자 권한 없이 symlink를 만들려면 필수)",
    "git 기본값을 바꾼다: git config --global core.symlinks true && git config --global core.autocrlf false",
  ];

  // 어느 파일에서 온 값인지가 처방을 가른다. clone 시점에 git이 그 값을 저장소의
  // `.git/config`에 복사해 두는데 local이 global을 이기므로, 이미 clone된 저장소는
  // 전역 설정을 바꿔도 실효값이 그대로다. 이 단계를 빠뜨리면 링크 재생성이 전부 실패한다.
  if (isLocalGitConfigOrigin(symlinksEntry?.origin)) {
    steps.push(
      "이 저장소의 .git/config에 값이 박혀 있다. local이 global을 이기므로 전역 설정만으로는 고쳐지지 않는다: git config --unset core.symlinks && git config --unset core.autocrlf",
    );
  }

  steps.push(
    "서브모듈을 확보한다: git submodule update --init --recursive",
    "이미 텍스트 파일로 체크아웃된 링크를 인덱스에서 되살린다(작업 트리가 깨끗할 때만): git ls-files -s | awk '$1 == 120000 { print $4 }' | xargs -r rm -f && git checkout -- .",
  );

  return steps.map((step, index) => `  ${index + 1}) ${step}`);
}

function isLocalGitConfigOrigin(origin) {
  return typeof origin === "string" && /(^|[\\/])\.git[\\/]config$/.test(origin.replace(/^file:/, ""));
}

// `--show-origin`을 함께 읽는 이유는 위 remediation이 값뿐 아니라 **출처**로 갈리기
// 때문이다. 키가 아예 없으면 git이 exit 1을 내므로, 그것을 "미설정"으로 조용히 처리한다.
function gitConfigEntry(key) {
  const result = spawnSync("git", ["config", "--show-origin", "--get", key], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") return null;

  const line = result.stdout.split("\n")[0]?.trim() ?? "";
  if (!line) return null;

  const separator = line.indexOf("\t");
  if (separator === -1) return { origin: null, value: line };
  return { origin: line.slice(0, separator).replace(/^file:/, ""), value: line.slice(separator + 1).trim() };
}

// 설정만 봐서는 개발자 모드·권한·파일시스템(FAT32, 일부 네트워크 드라이브) 문제를
// 못 잡는다. 실제 장착과 같은 자리(프로젝트 루트)에서 한 번 만들어 보고 지운다.
// dir과 file symlink는 Windows에서 서로 다른 플래그를 쓰므로 둘 다 확인한다.
function probeSymlinkCreation() {
  let probeRoot = null;
  try {
    probeRoot = fs.mkdtempSync(path.join(projectRoot, ".harness-symlink-probe-"));
    fs.mkdirSync(path.join(probeRoot, "target"));
    fs.writeFileSync(path.join(probeRoot, "target.txt"), "probe\n", "utf8");
    fs.symlinkSync("./target", path.join(probeRoot, "dir-link"), "dir");
    fs.symlinkSync("./target.txt", path.join(probeRoot, "file-link"), "file");
    return { ok: true, code: null };
  } catch (error) {
    return { ok: false, code: error?.code ?? String(error?.message ?? error) };
  } finally {
    if (probeRoot) {
      try {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      } catch {
        warnings.push(`symlink 진단용 임시 디렉터리를 지우지 못했습니다: ${relative(probeRoot)}`);
      }
    }
  }
}

function linkChildren(toolDir, childDir) {
  const sourceDir = path.join(harnessRoot, toolDir, childDir);
  if (!exists(sourceDir)) return;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const source = path.join(sourceDir, entry.name);
    const link = path.join(projectRoot, toolDir, childDir, entry.name);
    linkAdapterPath(source, link, entry.isDirectory() ? "dir" : "file");
  }
}

function pruneStaleLinks(toolDir, childDir) {
  const dir = path.join(projectRoot, toolDir, childDir);
  if (!exists(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const link = path.join(dir, entry.name);
    if (!isStaleHarnessLink(link)) continue;

    if (prune) {
      operations.push(`remove stale harness link ${relative(link)}`);
      if (!dryRun) fs.rmSync(link, { recursive: true, force: true });
    } else {
      operations.push(`stale harness link ${relative(link)} (kept; --no-prune set)`);
      warnings.push(`stale harness link ${relative(link)}: target no longer exists in the harness; re-run without --no-prune to remove`);
    }
  }
}

function pruneEmptyLegacyAdapterDirs() {
  for (const directory of [path.join(projectRoot, ".agents", "skills"), path.join(projectRoot, ".agents")]) {
    if (!isEmptyDirectory(directory)) continue;

    operations.push(`remove empty legacy adapter dir ${relative(directory)}`);
    if (!dryRun) fs.rmdirSync(directory);
  }
}

function isEmptyDirectory(directory) {
  try {
    const stats = fs.lstatSync(directory);
    return stats.isDirectory() && fs.readdirSync(directory).length === 0;
  } catch {
    return false;
  }
}

// A link is safe to prune only when it is a symlink that points inside the
// harness (something a previous attach created) AND its target no longer
// exists. Local files and overrides that point outside the harness are left
// untouched so renamed/removed harness adapters can be cleaned up without
// risking project-owned definitions.
function isStaleHarnessLink(link) {
  let stats;
  try {
    stats = fs.lstatSync(link);
  } catch {
    return false;
  }
  if (!stats.isSymbolicLink()) return false;

  let rawTarget;
  try {
    rawTarget = fs.readlinkSync(link);
  } catch {
    return false;
  }

  const resolved = path.resolve(path.dirname(link), rawTarget);
  const harnessAbs = path.resolve(harnessRoot);
  const insideHarness = resolved === harnessAbs || resolved.startsWith(`${harnessAbs}${path.sep}`);
  if (!insideHarness) return false;

  return !fs.existsSync(link); // existsSync follows the link; a missing target means stale
}

function linkAdapterPath(target, link, type) {
  if (exists(link) && !isExpectedSymlink(link, target) && !isSymlinkStandIn(link, target) && !force) {
    operations.push(`kept local override ${relative(link)}`);
    conflicts.push(`local adapter override: ${relative(link)}`);
    if (retrofit) {
      const fallback = fallbackAdapterPath(link);
      if (exists(fallback) && !isExpectedSymlink(fallback, target) && !force) {
        operations.push(`kept local fallback override ${relative(fallback)}`);
        conflicts.push(`local fallback adapter override: ${relative(fallback)}`);
        warnings.push(`manual adapter merge needed for ${relative(link)}; fallback ${relative(fallback)} already exists`);
      } else {
        operations.push(`add harness fallback ${relative(fallback)} for ${relative(link)}`);
        linkPath(target, fallback, type);
      }
    }
    return;
  }

  linkPath(target, link, type);
}

function fallbackAdapterPath(link) {
  const directory = path.dirname(link);
  const baseName = path.basename(link);
  const extension = path.extname(baseName);
  const stem = extension ? baseName.slice(0, -extension.length) : baseName;
  const fallbackName = `${stem.startsWith("harness-") ? stem : `harness-${stem}`}${extension}`;
  return path.join(directory, fallbackName);
}

function linkPath(target, link, type) {
  if (exists(link)) {
    if (isExpectedSymlink(link, target)) {
      operations.push(`kept ${relative(link)} -> ${readlink(link)}`);
      return;
    }

    // 이미 core.symlinks=false로 clone된 저장소를 되살리는 경로다. 이 경우 어댑터는
    // "타겟 경로가 적힌 한 줄짜리 텍스트 파일"로 남아 있는데, 예전에는 이것을 프로젝트가
    // 손으로 둔 로컬 override로 오인해 `kept local override`로 남기고 exit 0 했다.
    // 그래서 문서가 안내하는 "attach를 다시 실행하라"가 영구히 무효였다. 내용이 정확히
    // 우리가 만들려던 타겟을 가리킬 때만 교체하므로 진짜 override는 건드리지 않는다.
    if (isSymlinkStandIn(link, target)) {
      operations.push(`repair ${relative(link)} (symlink이 아니라 링크 경로가 적힌 텍스트 파일이었다)`);
      if (!dryRun) fs.rmSync(link, { force: true });
    } else if (!force) {
      fail(`path exists and is not the expected harness link: ${relative(link)} (use --force to replace)`);
    } else {
      removePath(link);
    }
  }

  const relativeTarget = toPortableRelative(path.dirname(link), target);
  operations.push(`link ${relative(link)} -> ${relativeTarget}`);

  if (dryRun) return;

  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(relativeTarget, link, type);
}

function ensureGitAttributes() {
  const attributesPath = path.join(projectRoot, ".gitattributes");
  if (!exists(attributesPath)) {
    ensureFile(attributesPath, GITATTRIBUTES_CONTENT);
    return;
  }

  // 프로젝트 소유 파일이므로 덮어쓰지 않는다. 다만 EOL을 고정하지 않는
  // `.gitattributes`는 CRLF 유입을 막지 못하므로 그 사실은 알린다.
  operations.push(`kept ${relative(attributesPath)}`);
  if (!/^\s*\*\s+.*\beol=lf\b/m.test(fs.readFileSync(attributesPath, "utf8"))) {
    warnings.push(
      `${relative(attributesPath)}에 \`* text=auto eol=lf\`가 없습니다. Windows에서 워킹트리가 CRLF로 체크아웃되면 하네스의 frontmatter 검사가 전부 오판합니다.`,
    );
  }
}

function ensureProjectDocs() {
  ensureDirectory(path.join(projectRoot, "docs", "raw"));
  ensureDirectory(path.join(projectRoot, "docs", "wiki"));

  ensureFileOrMarker(
    path.join(projectRoot, "docs", "wiki", "index.md"),
    readHarnessTemplate("wiki", "index.md"),
    "LLM-HARNESS:WIKI",
    // Retrofit injects only a pointer, never authoring rules: the wiki holds project
    // content (direction + lineage links); the "how to write the wiki" guidance lives
    // in wiki-ingest.md. Keep this block sentinel-free so harness:check does not flag
    // it as leaked guidance (see WIKI_AUTHORING_SENTINELS / assertWikiNoAuthoringGuidance).
    `이 위키에는 프로젝트 방향성과 raw unit 계보 링크만 둡니다. 위키 구조·영역(area)/섹션(section)
작성 규칙은 \`.harness/harness/protocols/wiki-ingest.md\`를 참고하세요(이 안내는 규칙 본문을
위키에 복사하지 않습니다).
`,
  );

  ensureFile(
    path.join(projectRoot, "docs", "raw", "README.md"),
    `# Raw Sources

이 디렉터리는 이 프로젝트의 raw PRD/ADR/notes를 저장한다.
공용 템플릿은 \`.harness/harness/templates/raw\`에서 제공된다.
`,
  );

  ensureFileOrMarker(
    path.join(projectRoot, "AGENTS.md"),
    `# Project Agent Guide

This project uses the shared LLM Project Harness mounted at \`.harness\`.
Answer in Korean by default unless the user asks otherwise.

## Project Intent

TODO: describe this product.

## Harness Entry Points

1. Read \`docs/wiki/index.md\`.
2. Read \`.harness/harness/protocols/session-start.md\`.
3. Follow only raw links relevant to the task.
4. Use \`$next-feature\` for open-ended product work.
5. Keep product-specific decisions in this project's \`docs/raw/\` and \`docs/wiki/\`.

Shared harness rules live in \`.harness/harness/\`. Root-level \`.codex/\`
and \`.claude/\` may contain symlinks to shared harness adapters plus
project-local skills or agents. Local project definitions are allowed and take
precedence when they occupy the same path.
`,
    "LLM-HARNESS",
    `## LLM Project Harness

This project uses the shared LLM Project Harness mounted at \`.harness\`.

- Read \`docs/wiki/index.md\` first when starting project work.
- Read \`.harness/harness/protocols/session-start.md\` for the shared workflow.
- Keep project-specific decisions in this project's \`docs/raw/\` and \`docs/wiki/\`.
- Root-level \`.codex/\` and \`.claude/\` may contain shared harness links plus project-local skills or agents.
- Local project definitions take precedence when they occupy the same path.
`,
  );
}

// Seeds `.harness-sync` with the current CHANGELOG head on first adoption (when
// the marker is missing), so a newly-attached project starts synced at the
// current version. It never advances an existing marker — once a consumer has a
// committed `.harness-sync`, bumping the submodule makes it stale and
// harness:check forces reconciliation via `harness:sync --ack`.
function ensureSyncFile() {
  const changelogPath = path.join(harnessRoot, "CHANGELOG.md");
  if (!exists(changelogPath)) return;
  const head = (/^##\s+(.+)$/m.exec(fs.readFileSync(changelogPath, "utf8")) ?? [])[1]?.trim();
  if (!head) return;

  const syncPath = path.join(projectRoot, ".harness-sync");
  if (exists(syncPath)) return;
  ensureFile(syncPath, `${head}\n`);
}

function ensurePackageScripts() {
  const packagePath = path.join(projectRoot, "package.json");
  const desiredScripts = {
    "harness:kickoff": "node .harness/scripts/harness/kickoff.mjs",
    "harness:approve": "node .harness/scripts/harness/approve.mjs",
    "harness:ingest": "node .harness/scripts/harness/wiki-ingest.mjs",
    "harness:check": "node .harness/scripts/harness/artifact-check.mjs",
    "harness:sync": "node .harness/scripts/harness/sync.mjs",
    "harness:gate": "node .harness/scripts/harness/gate.mjs",
    "harness:hooks": "node .harness/scripts/harness/install-hooks.mjs",
  };
  const legacyScripts = {
    "harness:kickoff": "node scripts/harness/kickoff.mjs",
    "harness:approve": "node scripts/harness/approve.mjs",
    "harness:ingest": "node scripts/harness/wiki-ingest.mjs",
    "harness:check": "node scripts/harness/artifact-check.mjs",
    "harness:sync": "node scripts/harness/sync.mjs",
    "harness:gate": "node scripts/harness/gate.mjs",
    "harness:hooks": "node scripts/harness/install-hooks.mjs",
  };
  const fallbackScripts = Object.fromEntries(
    Object.entries(desiredScripts).map(([name, command]) => [name.replace(/^harness:/, "llm-harness:"), command]),
  );

  let packageJson;
  if (exists(packagePath)) {
    packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } else {
    packageJson = {
      private: true,
      type: "module",
      scripts: {},
    };
  }

  packageJson.scripts ??= {};

  let changed = false;
  for (const [name, command] of Object.entries(desiredScripts)) {
    if (packageJson.scripts[name] === command) continue;
    if (packageJson.scripts[name] && packageJson.scripts[name] !== legacyScripts[name] && !force) {
      operations.push(`kept package script ${name}: ${packageJson.scripts[name]}`);
      conflicts.push(`package script override: ${name}`);
      if (retrofit) {
        const fallbackName = name.replace(/^harness:/, "llm-harness:");
        if (!packageJson.scripts[fallbackName]) {
          packageJson.scripts[fallbackName] = fallbackScripts[fallbackName];
          changed = true;
          operations.push(`set package script ${fallbackName}`);
          warnings.push(`use npm run ${fallbackName} for shared harness because ${name} already exists`);
        } else if (packageJson.scripts[fallbackName] !== fallbackScripts[fallbackName]) {
          operations.push(`kept package script ${fallbackName}: ${packageJson.scripts[fallbackName]}`);
          conflicts.push(`package fallback script override: ${fallbackName}`);
          warnings.push(`manual package script merge needed for ${fallbackName}; ${name} already exists`);
        } else {
          operations.push(`kept package script ${fallbackName}: ${packageJson.scripts[fallbackName]}`);
        }
      }
      continue;
    }
    packageJson.scripts[name] = command;
    changed = true;
    operations.push(`set package script ${name}`);
  }

  if (!changed) return;
  if (dryRun) return;

  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

// Ensures the consumer's committed `.claude/settings.json` disables background
// git-worktree isolation (`worktree.bgIsolation: "none"`). Consumer harness
// projects are single-branch personal repos where a forced EnterWorktree on
// background sessions breaks flows that write to the main working copy (e.g.
// next-feature's docs/raw/.next-unit anchor, kickoff scaffolding). Merge is
// non-destructive: other settings and an explicit opposite override are kept
// unless --force. Codex has no equivalent setting, so only `.claude` is touched.
function ensureClaudeSettings() {
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  const rel = relative(settingsPath);

  if (!exists(settingsPath)) {
    operations.push(`create ${rel} (worktree.bgIsolation: none)`);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      writeJsonFile(settingsPath, { worktree: { bgIsolation: "none" } });
    }
    return;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    operations.push(`kept ${rel} (unparseable JSON)`);
    conflicts.push(`settings not merged: ${rel} is not valid JSON`);
    warnings.push(`${rel} is not valid JSON; set worktree.bgIsolation to "none" manually`);
    return;
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    operations.push(`kept ${rel} (unexpected shape)`);
    conflicts.push(`settings not merged: ${rel} is not a JSON object`);
    warnings.push(`${rel} is not a JSON object; set worktree.bgIsolation to "none" manually`);
    return;
  }

  const worktree = settings.worktree;
  const worktreeIsObject = worktree !== null && typeof worktree === "object" && !Array.isArray(worktree);

  // A `worktree` value that is present but not an object is malformed; never
  // clobber it silently.
  if (worktree !== undefined && !worktreeIsObject && !force) {
    operations.push(`kept ${rel} (worktree is not an object)`);
    conflicts.push(`settings override: worktree in ${rel} is not an object`);
    warnings.push(`worktree in ${rel} is not an object; fix it or re-run with --force`);
    return;
  }

  const currentValue = worktreeIsObject ? worktree.bgIsolation : undefined;
  if (currentValue === "none") {
    operations.push(`kept ${rel} worktree.bgIsolation: none`);
    return;
  }

  // An explicit opposite value is a local override; preserve it unless --force.
  if (currentValue !== undefined && !force) {
    operations.push(`kept ${rel} worktree.bgIsolation: ${currentValue}`);
    conflicts.push(`settings override: worktree.bgIsolation is "${currentValue}" in ${rel}`);
    warnings.push(`worktree.bgIsolation is "${currentValue}" in ${rel}; re-run with --force to set it to "none"`);
    return;
  }

  const nextWorktree = worktreeIsObject ? { ...worktree, bgIsolation: "none" } : { bgIsolation: "none" };
  const next = { ...settings, worktree: nextWorktree };
  operations.push(`${currentValue === undefined ? "set" : "replace"} ${rel} worktree.bgIsolation: none`);
  if (!dryRun) writeJsonFile(settingsPath, next);
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureDirectory(directory) {
  if (exists(directory)) return;
  operations.push(`mkdir ${relative(directory)}`);
  if (!dryRun) fs.mkdirSync(directory, { recursive: true });
}

function ensureFile(filePath, content) {
  if (exists(filePath)) {
    operations.push(`kept ${relative(filePath)}`);
    return;
  }

  operations.push(`create ${relative(filePath)}`);
  if (dryRun) return;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function readHarnessTemplate(...parts) {
  return fs.readFileSync(path.join(harnessRoot, "harness", "templates", ...parts), "utf8");
}

function ensureFileOrMarker(filePath, content, markerName, markerContent) {
  if (!exists(filePath)) {
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

  if (pattern.test(content)) {
    return content.replace(pattern, block);
  }

  return `${content.trimEnd()}\n\n${block}\n`;
}

// git이 symlink를 만들지 못하면(core.symlinks=false) 링크 대신 타겟 경로가 적힌 한
// 줄짜리 일반 파일이 체크아웃된다. 그 파일이 정확히 우리가 만들려던 타겟을 가리킬
// 때만 true다. 판정을 보수적으로(한 줄 + 타겟 일치) 두는 이유는, 프로젝트가 직접
// 작성한 로컬 override 어댑터를 절대 지우면 안 되기 때문이다.
function isSymlinkStandIn(link, target) {
  let stats;
  try {
    stats = fs.lstatSync(link);
  } catch {
    return false;
  }
  if (!stats.isFile() || stats.size === 0 || stats.size > 512) return false;

  let content;
  try {
    content = fs.readFileSync(link, "utf8");
  } catch {
    return false;
  }

  const recorded = content.trim();
  if (!recorded || /[\r\n]/.test(recorded)) return false;
  return path.resolve(path.dirname(link), recorded) === path.resolve(target);
}

function isExpectedSymlink(link, target) {
  try {
    const stats = fs.lstatSync(link);
    if (!stats.isSymbolicLink()) return false;
    return path.resolve(path.dirname(link), fs.readlinkSync(link)) === path.resolve(target);
  } catch {
    return false;
  }
}

function readlink(link) {
  try {
    return fs.readlinkSync(link);
  } catch {
    return "";
  }
}

function removePath(filePath) {
  operations.push(`replace ${relative(filePath)}`);
  if (!dryRun) fs.rmSync(filePath, { recursive: true, force: true });
}

function writeReport() {
  if (!reportPath) return;

  operations.push(`${dryRun ? "would write" : "write"} ${retrofit ? "retrofit" : "attach"} report ${relative(reportPath)}`);
  if (dryRun) return;

  const content = [
    "# Harness Attach Report",
    "",
    `- Mode: ${retrofit ? "retrofit" : "attach"}${prune ? "" : " (no-prune)"}`,
    `- Harness: ${relative(harnessRoot)}`,
    "",
    "## Operations",
    "",
    ...operations.map((operation) => `- ${operation}`),
    "",
    "## Conflicts",
    "",
    ...(conflicts.length ? conflicts.map((conflict) => `- ${conflict}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, content, "utf8");
}

function printDiagnostics() {
  for (const conflict of conflicts) console.log(`- conflict: ${conflict}`);
  for (const warning of warnings) console.log(`- warning: ${warning}`);
}

function autoHarnessRoot(currentScriptPath) {
  return path.relative(projectRoot, path.resolve(path.dirname(currentScriptPath), "..", ".."));
}

function exists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
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

// symlink 타겟과 사람이 읽는 경로는 둘 다 POSIX 구분자로 낸다. Windows에서
// `path.relative`는 백슬래시를 주는데, 그대로 쓰면 operation/report/JSON 출력이
// 플랫폼마다 달라져 소비 프로젝트의 검증 스크립트가 갈린다. symlink 타겟은
// 슬래시로 넘겨도 Windows에서 정상 생성된다.
function toPosix(value) {
  return value.split(path.sep).join("/");
}

function toPortableRelative(from, to) {
  const relativePath = toPosix(path.relative(from, to)) || ".";
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function relative(filePath) {
  return toPosix(path.relative(projectRoot, filePath)) || ".";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;

    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(`[attach-submodule] ${message}`);
  process.exit(1);
}
