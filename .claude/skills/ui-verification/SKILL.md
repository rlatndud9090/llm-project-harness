---
name: ui-verification
description: "일일 배틀 퀴즈 UI, 반응형 화면, 상호작용, 공유 결과 검증이 필요할 때 사용한다."
---

# UI Verification 어댑터

공용 기준은 `docs/harness/protocols/ui-verification.md`다.

UI 변경 후에는 모바일/데스크톱 폭, 턴 수 표시, command panel, battle log,
guess combobox, 결과 공유 흐름을 확인한다. 필요하면 dev server 또는 브라우저
검증을 사용한다.

검증하지 못한 범위는 notes, final report, commit `Not-tested:`에 남긴다.
