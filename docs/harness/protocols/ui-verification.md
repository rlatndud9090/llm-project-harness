# UI 검증 프로토콜

UI 레이아웃, 상호작용, 반응형 동작이 바뀌었을 때 사용한다. 이 문서는
메일 에디터의 CSS 검증을 그대로 가져온 것이 아니다. 1일 1회 배틀형 포켓몬
퀴즈의 화면 품질을 검증하는 최소 강한 기준이다.

## 적용 대상

- 일일 퀴즈 화면, command panel, battle log, guess UI, result/share UI
- responsive layout
- 버튼, 입력, 탭, 상태 badge 같은 상호작용 요소

## 검증 기준

- 모바일/데스크톱 폭에서 텍스트가 겹치지 않는다.
- 버튼/탭/입력의 의미가 role/name으로 드러난다.
- 턴 수, 행동 결과, 공개된 힌트, 정답 입력 상태가 구분된다.
- command panel과 battle log가 서로 겹치거나 밀어내지 않는다.
- 결과 공유 화면에는 턴 수와 정답 여부가 분명하다.
- 빈 상태, placeholder, disabled 상태가 자연스럽다.
- 도메인 규칙을 UI 컴포넌트에 숨겨 넣지 않는다.

## 권장 절차

1. 관련 컴포넌트 테스트 또는 smoke 테스트를 작성한다.
2. 필요하면 dev server를 실행한다.
   ```sh
   npm run dev -- --host 127.0.0.1
   ```
3. desktop과 mobile viewport를 확인한다.
4. screenshot 또는 관찰 결과를 notes에 남긴다.
5. `npm run harness:gate`를 실행한다.

## 실패 모드

- **나쁨:** 화면을 "예쁘게" 만들었지만 지금 무엇을 눌러야 턴이 진행되는지 모른다.
- **좋음:** command panel, battle log, guess input이 즉시 보인다.

- **나쁨:** UI가 특성/타입 판정을 직접 계산한다.
- **좋음:** domain result를 받아 표현만 한다.
