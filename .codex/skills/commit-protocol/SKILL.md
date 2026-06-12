---
name: commit-protocol
description: "검증, 명시적 스테이징, 관련 문서 PRD/ADR 링크, Lore Commit Protocol 커밋을 수행할 때 사용한다."
---

# Commit Protocol 어댑터

공용 기준:

1. `.harness/harness/protocols/commit-protocol.md`
2. `.harness/harness/roles/integrator.md`
3. `AGENTS.md`의 Lore Commit Protocol

## 필수 순서

```sh
git status --short --branch
npm run harness:gate
git diff --stat
git add <관련 파일만>
git diff --cached --check
git diff --cached
```

## 필수 커밋 본문

```md
관련 문서:
[PRD](docs/raw/<type>/<slug>/prd.md)
[ADR](docs/raw/<type>/<slug>/adr.md)
```

notes-only는 작고 결정이 없는 chore/bugfix에
허용한다. 그 경우에도 `관련 문서:` 블록에 `[Notes](...)`를 넣고 `Related:`
trailer를 유지한다.

## 금지

- `git add -A`
- `git add .`
- `git add *`
- `git commit --no-verify`
- HEREDOC 없이 한 줄 `git commit -m`

커밋에는 `Related: docs/raw/<type>/<slug>/`와
`Co-authored-by: OmX <omx@oh-my-codex.dev>`를 포함한다.
