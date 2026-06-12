# UI 검증 프로토콜

UI 레이아웃, 상호작용, 반응형 동작이 바뀌었을 때 사용한다. 이 문서는
특정 제품의 CSS 검증을 그대로 가져온 것이 아니다. 웹앱, 모바일앱, 게임 UI에
공통으로 적용할 수 있는 최소 강한 기준이다.

## 적용 대상

- 주요 앱 화면, command/control surface, activity/log surface, 입력 UI, result/share UI
- responsive layout
- 버튼, 입력, 탭, 상태 badge 같은 상호작용 요소

## 검증 기준

- 모바일/데스크톱 폭에서 텍스트가 겹치지 않는다.
- 버튼/탭/입력의 의미가 role/name으로 드러난다.
- 핵심 상태, 사용자 행동 결과, 입력 상태, 오류/성공 상태가 구분된다.
- 주요 조작 영역과 결과/로그 영역이 서로 겹치거나 밀어내지 않는다.
- 결과 공유 화면이 있다면 공유에 필요한 핵심 정보가 분명하다.
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

- **나쁨:** 화면을 "예쁘게" 만들었지만 지금 무엇을 눌러야 진행되는지 모른다.
- **좋음:** 주요 조작, 현재 상태, 다음 행동이 즉시 보인다.

- **나쁨:** UI가 핵심 도메인 판정을 직접 계산한다.
- **좋음:** domain/application result를 받아 표현만 한다.
