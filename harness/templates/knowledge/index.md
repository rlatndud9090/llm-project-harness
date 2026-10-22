---
lph-knowledge: 1
knowledge_schema: 1
bootstrap: not-needed
---

# 프로젝트 지식

이 프로젝트에서 코드를 고칠 때 반복되기 쉬운 함정(`gotchas/`)과 지켜야 할 불변식(`invariants/`)을
영역(area)별 파일로 모아 둔다. 비활성이 된 항목의 ID는 `_tombstones.md`에 남긴다.

- 조회: 수정할 파일 경로로 `knowledge.mjs brief --paths <파일…>`을 실행한다. 전체를 읽지 않는다.
- 등록·정리: 플러그인의 knowledge-distill 스킬이 맡는다. 등록은 승인 게이트가 아니다.
