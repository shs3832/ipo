# Agent Guide

이 프로젝트의 작업자 메모는 [AGENTS.md](/Users/shs/Desktop/Study/ipo/AGENTS.md)를 기준 문서로 사용합니다.

- 사람용 프로젝트 개요: [README.md](/Users/shs/Desktop/Study/ipo/README.md)
- 에이전트/작업자용 맥락 메모: [AGENTS.md](/Users/shs/Desktop/Study/ipo/AGENTS.md)
- 현재 스레드 작업 기록: [issue.md](/Users/shs/Desktop/Study/ipo/issue.md)

## Current Notes

- 홈 화면 레이아웃은 `캘린더 상단, 종목 개요 하단` 순서입니다.
- 모바일에서는 캘린더를 숨기고 종목 개요만 노출합니다.
- UI 스타일은 `SCSS` 기반이며, 공통 스타일은 [`src/styles`](/Users/shs/Desktop/Study/ipo/src/styles)와 [`src/app/globals.scss`](/Users/shs/Desktop/Study/ipo/src/app/globals.scss)에 있습니다.
- 페이지별 스타일은 각 라우트의 `*.module.scss` 파일로 분리되어 있습니다.
- 공통 모바일 브레이크포인트는 현재 `1024px`입니다.
- 캘린더는 현재 평일만 표시하며, 주말 열은 렌더링 토글로 다시 켤 수 있게 숨겨져 있습니다.
- 캘린더 종목명은 최대 2줄 후 ellipsis 처리됩니다.
- 더미 종목 `에이블데이터`, `로보헬스`는 코드와 DB에서 제거되었습니다.
- 실데이터가 없을 때는 샘플 종목을 보여주지 않고 `fallback` 빈 상태로 동작합니다.
- `npm run mail:sample` 스크립트 이름은 유지되지만, 실제로는 준비된 알림 payload를 메일로 미리 보내는 preview 성격입니다.
- 사용자가 `md 파일 업데이트`라고 요청하면, 우선 [`issue.md`](/Users/shs/Desktop/Study/ipo/issue.md)에 현재 스레드에서 무엇을 어떻게 바꿨는지 기록하고 필요한 문서를 같이 맞춥니다.
