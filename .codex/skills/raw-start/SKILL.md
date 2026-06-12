---
name: raw-start
description: "확정된 branch-sized work unit의 raw directory와 템플릿을 생성할 때 사용한다."
---

# Raw Start 어댑터

공용 기준은 `.harness/harness/protocols/raw-start.md`다.

## 실행

```sh
npm run harness:start -- --title "<한국어 제목>"
```

현재 브랜치가 `main`이거나 유효한 work branch가 아니면 `--type`, `--slug`를
명시한다.

작업 단위가 아직 확정되지 않았으면 먼저 `$do-next`를 사용한다. 제품/도메인
결정이면 PRD/ADR 필요성을 검토하고, 작은 프로젝트 운영 변경은 notes로
추적한다.
