---
name: raw-start
description: "확정된 branch-sized work unit의 raw directory와 템플릿을 생성할 때 사용한다."
---

# Raw Start 어댑터

공용 기준은 `docs/harness/protocols/raw-start.md`다.

## 실행

```sh
npm run harness:start -- --title "<한국어 제목>"
```

현재 브랜치가 `main`이거나 유효한 work branch가 아니면 `--type`, `--slug`를
명시한다.

작업 단위가 아직 확정되지 않았으면 먼저 `work-intake`를 사용한다. 제품/구조/하네스
정책 변경이면 notes-only로 끝내지 말고 PRD/ADR 필요성을 검토한다.
