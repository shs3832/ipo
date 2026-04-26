# Product Surface

## Home Page

- 캘린더가 위, 종목 개요가 아래
- 모바일에서는 캘린더를 숨기고 종목 개요를 먼저 노출
- 모바일 상단 secondary CTA는 숨겨진 캘린더 대신 종목 개요 영역으로 연결
- 홈 `/`는 static + `revalidate = 300`
- 상단 요약 카드는 공개 정보만 사용하며, 현재는 `최근 갱신 기준`, `표시 범위`, `추적 중인 공모주`, `캘린더 이벤트`, `기준 시간대` 중심으로 노출
- 활성 수신자 수, 준비된 알림 잡 수, DB/Fallback 같은 운영 메타데이터는 공개 홈에서 노출하지 않음
- 공개 홈 snapshot은 public-only projection으로 조립하며, admin telemetry를 직접 pass-through 하지 않음
- 이벤트는 `청약마감`, `환불`, `상장`
- 현재 평일만 표시, 주말 열은 렌더링 토글로 복구 가능
- 종목 개요는 검색, 상태 칩, 정렬 select를 함께 제공
- 종목 개요는 `이번 주 마감`, `그다음 일정`, `지난 종목` 섹션으로 나뉘고, `지난 종목`은 기본 접힘
- 종목 개요의 스팩은 기본 숨김이며, 필터 줄 맨 뒤 `스팩 포함` 체크를 켰을 때만 함께 노출
- 종목 개요 필터 칩과 `스팩 포함` 숫자는 현재 검색/선택 필터 기준으로 화면에 보일 수 있는 카드 수를 표시하고, 접힘/`더 보기`로 잠깐 가린 카드는 포함
- 좁은 폭에서는 종목 개요 필터 줄이 한 줄 가로 스크롤을 유지하고, 카드 리스트는 일부만 먼저 보여준 뒤 `더 보기`로 확장

## Calendar UX

- 오늘 날짜는 `오늘` badge와 stronger emphasis 사용
- 필터 체크박스는 브라우저 `localStorage`에 저장
- 캘린더의 스팩은 기본 숨김이며, 필터 줄의 `스팩 포함` 체크를 켰을 때만 함께 노출
- 캘린더 필터 칩 숫자는 현재 달력 그리드 범위 안에서 보일 수 있는 고유 종목 수 기준이며, 다른 필터가 잠깐 가린 항목까지 포함할 수 있음
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
- 현재 시각 방향은 `Calm IPO Desk`
- 과한 그라데이션, 큰 blur, 과도한 pill radius보다 중립 배경, 흰색 surface, 낮은 radius, 명확한 정보 위계를 우선
- select는 접근성을 위해 네이티브 `<select>`를 유지하되, SCSS로 커스텀 화살표/hover/focus 상태를 입히는 방식을 우선
- 모바일 카드 내부 정보는 세로 나열보다 핵심 label/value가 빠르게 훑히는 요약형 밀도를 우선
- 루트 viewport 기준은 `device-width`
- 공통 density breakpoint는 `1024px`, 2열 레이아웃 붕괴 기준은 `900px`, 초소형 폰 보정은 `480px`
- 스타일 구조:
  - 공통: [src/styles](/Users/shs/Desktop/Study/ipo/src/styles)
  - 전역: [src/app/globals.scss](/Users/shs/Desktop/Study/ipo/src/app/globals.scss)
  - 페이지별: `*.module.scss`

## Admin Surface

- `/admin`은 로그인 보호
- 로그인 실패가 짧은 시간에 반복되면 잠시 재시도가 제한될 수 있음
- 주요 역할:
  - 운영 로그 확인
  - score 상태 요약 확인
  - 발송 상태 확인
- `/admin/recipients`
  - verified 이메일 채널 관리
  - 이메일 알림 on/off
  - 앱푸시 구독 저장/해제/테스트 발송
  - 서버 액션/API 처리 중 버튼 스피너와 상태 문구 표시
  - 페이지 이동/초기 렌더 중 수신 채널 전용 loading 화면 표시

## Notification Surface

- closing-day analysis 메일
- closing-soon reminder 메일
- closing-day analysis 앱푸시
- 종목명 기준 스팩(`기업인수목적`, `스팩`, `SPAC`)은 자동 메일 대상에서 제외
- 현재는 점수 노출 대신 공시 기반 체크 포인트와 데이터 상태 중심 문구 사용
- 링크는 `APP_BASE_URL` 기준
- 채널 preference 기반은 추가됐으며, 운영 기본값은 이메일 on / 앱푸시 off
- `/admin/recipients`에서 이메일 채널 on/off와 앱푸시 구독 저장/해제/테스트 발송을 조작할 수 있음
- 앱푸시는 Web Push 기반이며, 클릭 시 알림 payload의 상세 URL 또는 기본 경로로 이동
- 이미 열린 앱 창이 있으면 서비스워커가 앱에 이동 메시지를 보내고, 앱 루트에서 `푸시 알림을 열고 있습니다` 오버레이와 스피너를 표시한 뒤 대상 URL로 이동
- 새 창/콜드 스타트에서는 전역 `loading.tsx`가 요청한 화면을 불러오는 중임을 표시
- 앱푸시는 VAPID env와 브라우저 권한, 서비스 워커 등록, 브라우저별 PWA 제약의 영향을 받음

## Known Product Gaps

- 데이터 품질은 아직 종목별 편차가 큼
- KIND-first ingest는 아직 완전하지 않음
- Telegram adapter는 데이터 모델만 있고 발송은 미구현
- public multi-recipient UI와 일반 사용자 개인화 화면은 아직 없음
