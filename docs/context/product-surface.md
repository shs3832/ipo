# Product Surface

## Home Page

- 캘린더가 위, 종목 개요가 아래
- 모바일에서는 캘린더를 숨기고 종목 개요를 먼저 노출
- 모바일 상단 secondary CTA는 숨겨진 캘린더 대신 종목 개요 영역으로 연결
- 홈 `/`는 static + `revalidate = 300`
- 이벤트는 `청약마감`, `환불`, `상장`
- 현재 평일만 표시, 주말 열은 렌더링 토글로 복구 가능
- 종목 개요는 검색, 상태 칩, 정렬 select를 함께 제공
- 종목 개요는 `이번 주 마감`, `그다음 일정`, `지난 종목` 섹션으로 나뉘고, `지난 종목`은 기본 접힘
- 종목 개요의 스팩은 기본 숨김이며, 필터 줄 맨 뒤 `스팩 포함` 체크를 켰을 때만 함께 노출
- 좁은 폭에서는 종목 개요 필터 줄이 한 줄 가로 스크롤을 유지하고, 카드 리스트는 일부만 먼저 보여준 뒤 `더 보기`로 확장

## Calendar UX

- 오늘 날짜는 `오늘` badge와 stronger emphasis 사용
- 필터 체크박스는 브라우저 `localStorage`에 저장
- 일정은 `closing date` 기준으로 표시

## Public Detail Page

- 상단 quick facts 우선
- 현재 핵심 항목:
  - `확정 공모가`
  - `최소청약금액`
  - `환불일`
  - `상장예정일`
  - `유통가능물량`
  - `주관사`
- 이벤트 타임라인은 제거됨
- source metadata는 admin이 아니면 숨김

## Public Score UI Status

- 홈 카드의 점수 상태 배지와 종합점수는 현재 `display: none`으로 숨겨 둠
- 상세 히어로의 점수 pill, 점수 카드, 산출 근거 블록도 현재 `display: none`으로 숨겨 둠
- admin의 `V2 점수 상태` 카드도 현재 `display: none`으로 숨겨 둠
- 공개 화면은 지금 `점수형 추천`보다 `공시 기반 체크 포인트` 중심
- 점수 UI는 DOM을 유지하고 있으므로, 재오픈 시에는 `scoreHidden` 제거가 핵심 복구 포인트
- 자세한 재오픈 절차는 [score-rollout-status.md](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)를 기준으로 본다

## UI Constraints

- `유통가능물량(floatRatio)`은 이미 percent 값이므로 UI에서 다시 100배 하면 안 됨
- 루트 viewport 기준은 `device-width`
- 공통 density breakpoint는 `1024px`, 2열 레이아웃 붕괴 기준은 `900px`, 초소형 폰 보정은 `480px`
- 스타일 구조:
  - 공통: [src/styles](/Users/shs/Desktop/Study/ipo/src/styles)
  - 전역: [src/app/globals.scss](/Users/shs/Desktop/Study/ipo/src/app/globals.scss)
  - 페이지별: `*.module.scss`

## Admin Surface

- `/admin`은 로그인 보호
- 주요 역할:
  - 운영 로그 확인
  - score 상태 요약 확인
  - 발송 상태 확인
- `/admin/recipients`
  - verified 이메일 채널 관리

## Email Surface

- closing-day analysis 메일
- closing-soon reminder 메일
- 종목명 기준 스팩(`기업인수목적`, `스팩`, `SPAC`)은 자동 메일 대상에서 제외
- 현재는 점수 노출 대신 공시 기반 체크 포인트와 데이터 상태 중심 문구 사용
- 링크는 `APP_BASE_URL` 기준

## Known Product Gaps

- 데이터 품질은 아직 종목별 편차가 큼
- KIND-first ingest는 아직 완전하지 않음
- Telegram adapter는 데이터 모델만 있고 발송은 미구현
- public multi-recipient UI는 아직 없음
