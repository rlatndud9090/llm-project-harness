---
status: {status}
base_commit: {base_commit}
plan_hash: {plan_hash}
cutoff: {cutoff}
pr_source: {pr_source}
---

# 지식 소급 부트스트랩 원장

기존 final 단위를 한 번씩 훑어 지식 후보 판정을 남기는 원장이다. 판정은 엔진의 `bootstrap mark`로만 갱신한다.
모든 행이 `대기`를 벗어나면 `bootstrap finalize`로 지식 계층을 활성화한다.

| unit | area | date | 판정 | IDs | 비고 |
| --- | --- | --- | --- | --- | --- |
