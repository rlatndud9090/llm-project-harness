---
name: ui-verification
description: "앱 UI, 반응형 화면, 상호작용, 접근성, 공유/결과 화면 검증이 필요할 때 사용한다."
---

# UI Verification 어댑터

공용 기준은 `${CLAUDE_PLUGIN_ROOT}/harness/protocols/ui-verification.md`다.

UI 변경 후에는 모바일/데스크톱 폭, 주요 조작, 상태 표시, 입력 흐름,
결과/공유 흐름을 확인한다. 필요하면 dev server 또는 브라우저 검증을 사용한다.
브라우저 검증은 **토큰 효율 우선** — 부분 스냅샷·스크린샷만 되받는 CLI 드라이버(예: Playwright CLI)를 브라우저 제어 MCP보다 먼저 쓴다.

검증하지 못한 범위는 notes, final report, commit `Not-tested:`에 남긴다.
