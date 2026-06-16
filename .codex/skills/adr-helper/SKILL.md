---
name: adr-helper
description: "PRD에서 ADR이 필요하다고 결론났을 때 아키텍처 결정을 기록한다."
---

# ADR Helper 어댑터

공용 기준은 `.harness/harness/protocols/adr-helper.md`다. ADR 작성은 선택이며,
`$prd-helper`의 ADR 필요 여부 판단에서 필요하다고 결론났을 때만 사용한다.

## 실행 순서

1. `.harness/harness/protocols/adr-helper.md`를 읽는다.
2. 결정 선택지와 제약을 끌어낸다(`$deep-interview`가 있으면 활용, 없으면 명시 질문).
3. `.harness/harness/roles/researcher.md`로 선택지별 트레이드오프를 조사한다.
4. `.harness/harness/roles/architect.md`로 결정/선택지/선택 근거/결과/검증을 작성한다.
5. `.harness/harness/roles/reviewer.md`로 선택지 비교와 placeholder를 검토한다.

ADR은 `proposed` 상태로 작성하고, 사용자 명시 승인 전에는 `accepted`로 바꾸지
않는다. accepted ADR 본문은 고쳐 쓰지 않는다.
