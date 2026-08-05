#!/usr/bin/env node
import { ensureHarnessLink } from "./lib.mjs";

// Consumer postinstall hook. The harness is a devDependency (not a git submodule),
// so after every `npm install`/`npm ci` this recreates the `.harness` symlink into
// the installed `node_modules/llm-project-harness` package. That keeps every
// `.harness/...` reference (adapters, protocols, package scripts) resolving without
// a submodule, and survives npm wiping/reinstalling node_modules.
//
// A consuming project wires it as `"postinstall": "node
// node_modules/llm-project-harness/scripts/harness/link.mjs || true"`. The `|| true`
// plus this script's own never-throw contract mean a production `npm ci --omit=dev`
// (where the harness is absent) never fails the install — the mount just stays
// unbuilt, which is correct because the app never needs the harness at runtime.

try {
  const result = ensureHarnessLink(process.cwd());
  if (result.status === "created" || result.status === "would-create") {
    console.log("[harness:link] .harness -> node_modules/llm-project-harness");
  } else if (result.status === "occupied") {
    console.warn(
      "[harness:link] .harness가 심볼릭 링크가 아니라 실제 디렉터리입니다(옛 git submodule일 수 있음). " +
        "먼저 `git submodule deinit -f .harness && git rm -f .harness && rm -rf .git/modules/.harness`로 제거한 뒤 다시 설치하세요.",
    );
  }
  // "ok"/"package-absent" are silent: the mount is already correct, or the harness
  // is not installed here (prod --omit=dev) and nothing needs linking.
} catch (error) {
  // Never fail the install. A broken mount is recoverable by re-running attach.
  console.warn(`[harness:link] .harness 링크 생성을 건너뜁니다(무시): ${error?.message ?? error}`);
}
