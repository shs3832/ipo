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
- 캘린더의 오늘 날짜는 `오늘` badge와 강조 스타일로 표시됩니다.
- 캘린더 종목명은 최대 2줄 후 ellipsis 처리됩니다.
- 캘린더 상단에는 `매일 오전 6시 갱신`과 `상장일 시초가 10:10 / 10:30 추가 확인` 안내 문구가 있습니다.
- 캘린더 필터 체크박스 상태는 현재 브라우저 `localStorage`에 저장됩니다.
- 향후 개인화 확장 시 이 필터 상태는 사용자별 DB preference로 옮길 후보이며, 공개 read path에서 자동 write는 피하는 방향입니다.
- 더미 종목 `에이블데이터`, `로보헬스`는 코드와 DB에서 제거되었습니다.
- 실데이터가 없을 때는 샘플 종목을 보여주지 않고 `fallback` 빈 상태로 동작합니다.
- 현재 수집 파이프라인은 `OpenDART 요약 + OpenDART 원문 증권신고서 + KIND 공모일정(상장) + KIND 신규상장기업현황 + KIND 상세 + KIND 시세` 조합입니다.
- OpenDART `estkRs` 일반사항의 `배정기준일(asstd)`이 있으면 현재는 실권주/배정형 비IPO로 보고 캘린더에서 제외합니다.
- OpenDART 원문 파싱으로 `희망 공모가 밴드`, `최소청약주수`, `증거금률`을 일부 종목에서 채웁니다.
- KIND 상세 보강으로 `확정 공모가`, `일반청약 경쟁률`, `IR 일정`, `수요예측 일정`, `유통가능주식수`, `유통가능물량 비율`을 일부 종목에서 채웁니다.
- 상장일 당일 `10:10`, `10:30` 추가 sync에서 KIND 시세 기준 `시초가`, `공모가 대비 수익률`을 저장합니다.
- 일반적인 소스 누락은 `2일` 유예 후 `WITHDRAWN` 처리하지만, 위 기준으로 비IPO 판정된 건은 즉시 `WITHDRAWN` 처리합니다.
- 상세 페이지는 `데이터 상태`, `상장일 시초가`, `공모가 대비 수익률`, `일반청약 경쟁률`, `유통가능물량`, `IR/수요예측 일정`까지 표시합니다.
- 자동 메일은 `확정 공모가`, `환불일`, `주관사`가 있어야 생성되며, `상장 예정일`이 비어 있으면 `발송 보류` 대신 `데이터 상태: 일부 미확인`으로 남깁니다.
- 공개 화면과 메일의 정량 점수는 현재 비공개이며, 공시 기반 체크 포인트 중심으로 안내합니다.
- DB는 현재 Prisma 스키마 기준으로 `prisma db push`까지 한 번 반영된 상태입니다.
- `npm run mail:sample` 스크립트 이름은 유지되지만, 실제로는 준비된 알림 payload를 메일로 미리 보내는 preview 성격입니다.
- 사용자가 `md 파일 업데이트`라고 요청하면, 우선 [`issue.md`](/Users/shs/Desktop/Study/ipo/issue.md)에 현재 스레드에서 무엇을 어떻게 바꿨는지 기록하고 필요한 문서를 같이 맞춥니다.
