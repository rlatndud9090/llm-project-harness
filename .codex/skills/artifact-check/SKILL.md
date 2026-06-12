---
name: artifact-check
description: "raw/wiki/harness 아티팩트, PRD/ADR 필요성, 도구별 어댑터 정합성을 검증한다."
---

# Artifact Check 어댑터

공용 기준은 `.harness/harness/protocols/artifact-validation.md`다.

## 실행

```sh
npm run harness:check
```

## 수동 확인

- 새 PRD/ADR/notes가 한국어인지 확인한다.
- approved PRD / accepted ADR에 `approval:` 근거가 있는지 확인한다.
- Codex/ClaudeCode `do-next` 어댑터와 `$do-next` 호환 라우팅이 있는지 확인한다.
- 제품/도메인 구조 변경이 notes-only로 남지 않았는지 확인한다.
- 하네스 submodule 업데이트나 adapter 정리가 제품 기능 변경과 섞이지 않았는지 확인한다.
- wiki가 raw 링크 한 줄 이상의 synthesis dump로 커지지 않았는지 확인한다.
- 실패 출력은 수정 전까지 무시하지 않는다.
