# Issue Log

## 2026-03-21

### Thread Summary

현재 스레드에서는 홈/상세/로그인/관리자 화면의 디자인 시스템 정리, 샘플 종목 제거, 모바일 UX 조정, 그리고 문서 동기화 작업을 진행했다.

### What Happened

1. 토스 앱 디자인 시스템을 그대로 복제하지 않고, 정보 위계/여백/카드 중심 레이아웃만 참고하는 방향으로 정리했다.
2. 전역 `globals.css` 중심 구조를 `SCSS 공통 레이어 + 페이지별 module.scss` 구조로 전환했다.
3. 홈 화면에서 `종목 개요`를 캘린더 오른쪽이 아니라 아래쪽으로 이동했다.
4. 샘플 종목 데이터 `에이블데이터`, `로보헬스`를 코드에서 제거하고, 실데이터가 없을 때는 `fallback` 빈 상태로 동작하게 바꿨다.
5. DB에 남아 있던 더미 종목 2건도 실제로 삭제했다.
6. 모바일 반응형을 조정해 `1024px` 이하에서는 캘린더를 숨기고 종목 개요만 보이도록 변경했다.
7. 모바일 viewport를 `1024`로 설정했다.
8. 캘린더에서는 토요일/일요일 열을 숨기되, 다시 켤 수 있도록 렌더링 토글 방식으로 남겨뒀다.
9. 캘린더 이벤트 카드 종목명은 최대 2줄까지 보이고 이후는 ellipsis 처리되도록 바꿨다.
10. `README.md`, `agent.md`, `AGENTS.md`를 현재 코드 상태에 맞게 업데이트했다.

### Main Code Changes

- 디자인/스타일 구조
  - `src/app/globals.scss`
  - `src/styles/_tokens.scss`
  - `src/styles/_mixins.scss`
  - `src/styles/reset.scss`
  - `src/styles/common.scss`
  - 각 페이지별 `*.module.scss`
- 홈 UI/캘린더
  - `src/app/page.tsx`
  - `src/app/page.module.scss`
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
- 로그인/관리자/상세
  - `src/app/login/page.tsx`
  - `src/app/login/page.module.scss`
  - `src/app/admin/page.tsx`
  - `src/app/admin/page.module.scss`
  - `src/app/admin-log-panel.tsx`
  - `src/app/admin-log-panel.module.scss`
  - `src/app/ipos/[slug]/page.tsx`
  - `src/app/ipos/[slug]/page.module.scss`
- fallback 전환 및 샘플 제거
  - `src/lib/fallback-data.ts` 추가
  - `src/lib/mock-data.ts` 삭제
  - `src/lib/jobs.ts`
  - `src/lib/types.ts`
- 메타/설정
  - `src/app/layout.tsx`
  - `next.config.ts`
  - `package.json`

### DB / Runtime Actions

- Prisma를 통해 DB에 남아 있던 더미 종목 `에이블데이터`, `로보헬스`를 삭제했다.
- `npm run lint`와 `npm run build`를 여러 차례 실행해 변경 후 상태를 검증했다.

### Current Decisions To Remember

- 홈 화면은 `캘린더 위 / 종목 개요 아래` 구조다.
- 모바일(`1024px` 이하)에서는 캘린더를 숨기고 종목 개요만 보여준다.
- 캘린더는 현재 평일만 표시한다.
- 실데이터가 없으면 샘플 종목을 만들지 않고 `fallback` 빈 상태로 동작한다.
- `mail:sample`은 이름만 남아 있고 실제로는 preview 용도다.

### Documentation Rule

앞으로 사용자가 `md 파일 업데이트`라고 요청하면, 이번 파일 형식을 기준으로 `issue.md`를 먼저 갱신하고 필요한 경우 `README.md`, `agent.md`, `AGENTS.md`를 함께 맞춘다.

### Follow-up: Review Fixes

리뷰에서 지적된 `daily-sync` 캐시 우회 부재와 동일 소스 기준 분석 미갱신 문제를 후속으로 수정했다.

### What Changed In Follow-up

1. `daily-sync`에 `forceRefresh` 옵션을 추가해 운영 중 긴급 재동기화 시 캐시를 우회할 수 있게 했다.
2. API 경로에서는 `refresh=force` 또는 `bypassCache=1` 쿼리로 강제 새로고침을 받을 수 있게 연결했다.
3. CLI 스크립트에서도 `--force-refresh` / `--force` 인자를 받아 수동 실행 시 캐시 우회가 가능하게 했다.
4. 소스 `checksum`이 같더라도 `buildAnalysis()`는 다시 계산하고, 점수/요약/포인트가 달라진 경우에만 새 분석 레코드를 적재하도록 바꿨다.
5. 소스 데이터와 이벤트 재적재는 계속 생략해 비용 절감 효과는 유지했다.

### Main Code Changes In Follow-up

- 캐시 우회/동기화
  - `src/lib/external-cache.ts`
  - `src/lib/jobs.ts`
  - `src/lib/sources/opendart-ipo.ts`
  - `src/app/api/jobs/daily-sync/route.ts`
  - `scripts/daily-sync.ts`

### Verification In Follow-up

- `npm run lint`
- `npm run build`

### Follow-up: Performance / Safety / Loading UX

속도 개선 검토, 전체 코드리뷰, 운영 리스크 수정, 로딩 UX 보강까지 이어서 진행했다.

### What Changed In This Follow-up

1. 홈 화면 조회를 관리자용 대시보드 조회와 분리하고, 공개 홈은 캐시된 read model로 제공하도록 바꿨다.
2. 홈 `/`는 관리자 쿠키 확인을 제거해 정적 `revalidate 5m` 경로로 복구했다.
3. 상세 페이지 데이터는 공개 정보와 관리자 메타데이터를 분리해 읽고, 공개 read path에서 불필요한 write가 일어나지 않게 정리했다.
4. `/admin`, `/ipos/[slug]`에 `loading.tsx`를 추가했고, 이후 상세는 중앙 스피너형, 관리자는 스피너 + 레이아웃 유지형으로 보강했다.
5. 관리자 인증은 `ADMIN_ACCESS_PASSWORD`와 `ADMIN_SESSION_SECRET`이 모두 없으면 동작하지 않도록 fail-closed로 바꿨다.
6. 잡 API는 `JOB_SECRET`이 없으면 공개되지 않고 misconfigured 상태로 차단되게 수정했다.
7. 날짜 계산은 `Asia/Seoul` 기준 helper로 통일해 월 경계/당일 마감/상태 계산이 서버 로컬 타임존에 흔들리지 않게 했다.
8. `daily-sync` 후 현재 표시 범위에 있지만 소스에서 사라진 종목은 `WITHDRAWN`으로 마킹하도록 바꿨다.
9. 알림 발송은 검증된 이메일만 사용하고, verified primary 이메일이 있으면 그 채널을 우선 사용하게 정리했다.
10. delivery idempotency key에 채널 주소를 포함해 다중 이메일에서 상태가 꼬이지 않게 수정했다.
11. DB 가용성 캐시는 고정 false가 아니라 TTL 기반으로 바꿔 일시 장애 후 자동 복구가 가능하게 했다.

### Main Code Changes In This Follow-up

- 성능/캐시/read model
  - `src/lib/page-data.ts`
  - `src/app/page.tsx`
  - `src/app/admin/page.tsx`
  - `src/app/ipos/[slug]/page.tsx`
  - `src/lib/jobs.ts`
  - `src/lib/fallback-data.ts`
  - `src/lib/types.ts`
- 보안/인증
  - `src/lib/admin-auth.ts`
  - `src/app/login/page.tsx`
  - `src/app/login/actions.ts`
  - `src/lib/job-auth.ts`
  - `src/app/api/jobs/daily-sync/route.ts`
  - `src/app/api/jobs/prepare-daily-alerts/route.ts`
  - `src/app/api/jobs/dispatch-alerts/route.ts`
- 시간대/소스
  - `src/lib/date.ts`
  - `src/lib/sources/opendart-ipo.ts`
  - `src/lib/sources/opendart-financials.ts`
  - `src/lib/sources/opendart.ts`
  - `src/app/home-content.tsx`
- 로딩 UX
  - `src/app/admin/loading.tsx`
  - `src/app/ipos/[slug]/loading.tsx`
  - `src/app/admin/page.module.scss`
  - `src/app/ipos/[slug]/page.module.scss`

### Measured Results In This Follow-up

- 기존 측정 기준:
  - `getDashboardSnapshot()` 약 `2.9~3.4s`
  - 관리자 페이지 전체 흐름 약 `5.6s`
  - 상세 조회 약 `571ms`
- 변경 후 측정 기준:
  - 공개 홈 helper 약 `2087ms`
  - 관리자 dashboard helper 약 `1010ms`
  - 실제 HTTP 기준 홈 `/` 첫 응답 약 `23ms`, warm 응답 약 `1.4~1.5ms`
  - 실제 HTTP 기준 상세 첫 응답 약 `56ms`
- `next build` 결과 홈 `/`는 정적 `Revalidate 5m` 경로로 확인했다.

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

### Follow-up: Calendar Event Data / Listing Source / Preference Direction

캘린더에서 `청약마감`만 보이고 `환불/상장`이 비어 있던 문제를 확인하고, 소스 정규화와 사용자 필터 유지 동작까지 정리했다.

### What Changed In This Follow-up

1. OpenDART `estkRs` 응답에서 `pymd`를 읽어 현재 구조에서 가장 가까운 `환불` 일정으로 정규화했다.
2. 공개 홈/관리자 조회 범위가 `subscriptionStart/subscriptionEnd`만 보던 구조를 `refundDate/listingDate`까지 포함하도록 확장했다.
3. KIND `신규상장기업현황` 보조 소스를 추가해 `listingDate`를 보강할 수 있게 했다.
4. 현재 표시 범위(`현재월 + 다음월`) 기준 KIND 상장 데이터와 OpenDART 종목명을 정규화 매칭해 `listingDate`를 덧입히도록 구성했다.
5. 강제 sync를 다시 실행해 DB 기준 `REFUND` 이벤트가 실제로 생성되고, `아이엠바이오로직스`에 `LISTING` 이벤트 1건이 생성된 것을 확인했다.
6. 캘린더 상단에 `매일 오전 6시 갱신` 및 `증권사/거래소 사정에 따른 일정 변동 가능` 안내 문구를 추가했다.
7. 캘린더 필터 체크박스 상태는 브라우저 `localStorage`에 저장해 새로고침/재방문 시 마지막 선택을 복원하도록 바꿨다.
8. 향후 개인화/크로스플랫폼 확장을 고려할 때, 현재 필터 저장은 `localStorage`가 맞지만 로그인 기반 사용자 식별이 생기면 DB preference로 승격하는 방향이 적절하다는 판단을 남겼다.

### Main Code Changes In This Follow-up

- 일정 정규화 / 보조 소스
  - `src/lib/sources/opendart-ipo.ts`
  - `src/lib/sources/kind-listings.ts` 추가
  - `src/lib/jobs.ts`
- 캐시/운영 안정성
  - `src/lib/external-cache.ts`
- 홈 캘린더 UX
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`

### Verification In This Follow-up

- `npm run lint`
- `npm run job:daily-sync -- --force-refresh`
- DB 확인 결과:
  - `SUBSCRIPTION 18`
  - `REFUND 16`
  - `LISTING 1`

### Current Decisions To Remember In This Follow-up

- `환불`은 현재 OpenDART `pymd`를 임시/실용적 기준값으로 사용한다.
- `상장`은 OpenDART 단독으로는 불안정하므로 KIND `신규상장기업현황`으로 보강한다.
- 캘린더 상단에는 데이터 갱신 주기와 일정 변동 가능성을 항상 명시한다.
- 필터 토글 기억은 현재 `localStorage` 기반이다.
- 향후 개인화가 본격화되면 사용자별 DB preference 저장으로 확장하되, 읽기 경로에서 자동 write는 피하고 사용자 액션 기반 저장으로 설계한다.

### Follow-up: IPO Data Enrichment / Detail Field Expansion / Schema Sync

공모주 상세에서 비어 있던 필드를 줄이기 위해 OpenDART 원문과 KIND 상세를 함께 사용하도록 수집 파이프라인을 확장했고, DB 스키마 반영 및 재동기화까지 완료했다.

### What Changed In This Follow-up

1. OpenDART `estkRs` 요약값만 쓰지 않고, 증권신고서 원문 viewer를 파싱해 `희망 공모가 밴드`, `최소청약주수`, `증거금률`을 추가 수집하도록 만들었다.
2. KIND `신규상장기업현황` 목록에서 `isurCd`뿐 아니라 `bzProcsNo`도 함께 확보하도록 바꿨다.
3. KIND 상세 `회사개요/공모정보`를 파싱해 `확정 공모가`, `일반청약 경쟁률`, `IR 일정`, `수요예측 일정`, `유통가능주식수`, `유통가능물량 비율`, `상장일`, `납입일`을 보강하도록 추가했다.
4. OpenDART 값과 KIND 값이 충돌할 때는 KIND 상세의 확정 공모가를 우선 반영하도록 해, 아이엠바이오로직스처럼 OpenDART가 하단 희망가를 들고 오던 케이스를 바로잡았다.
5. 상세 페이지에서 새로 수집한 `수요예측 일정`, `IR 일정`, `일반청약 경쟁률`, `유통가능주식수`, `유통가능물량`을 표시하도록 확장했다.
6. `Ipo.kindIssueCode` 등 이미 코드에 추가돼 있던 필드와 새 수집 경로가 실제 DB에 저장되도록 `prisma db push`를 실행해 스키마를 현재 코드 기준으로 맞췄다.
7. `daily-sync`를 다시 실행해 DB 저장 경로까지 확인했고, 아이엠바이오로직스에 대해 실제 값 적재를 검증했다.

### Main Code Changes In This Follow-up

- 수집 소스 확장
  - `src/lib/sources/opendart-ipo.ts`
  - `src/lib/sources/opendart-prospectus.ts` 추가
  - `src/lib/sources/kind-listings.ts`
  - `src/lib/sources/kind-offer-details.ts` 추가
  - `src/lib/sources/kind-stock-prices.ts`
- 동기화 / read model
  - `src/lib/jobs.ts`
  - `src/lib/page-data.ts`
  - `src/lib/types.ts`
- 상세 UI
  - `src/app/ipos/[slug]/page.tsx`
- 스키마
  - `prisma/schema.prisma`

### Verification In This Follow-up

- `npm run lint`
- `npx prisma generate`
- `npx prisma db push`
- `npm run job:daily-sync`
- `npm run build`

### Verified Result Sample

- `아이엠바이오로직스`
  - 희망 공모가 `19,000원 ~ 26,000원`
  - 확정 공모가 `26,000원`
  - 상장일 시초가 `104,000원`
  - 공모가 대비 수익률 `+300%`
  - 최소청약주수 `20주`
  - 증거금률 `50%`
  - 일반청약 경쟁률 `1805.8:1`
  - 유통가능주식수 `2,075,047주`
  - 유통가능물량 `14%`
  - IR 일정 / 수요예측 일정 / 상장일 / 환불일 채움 확인

### Current Decisions To Remember In This Follow-up

- 현재 수집 우선순위는 `OpenDART 요약 + OpenDART 원문 + KIND 목록 + KIND 상세` 조합이다.
- `희망 공모가`, `최소청약주수`, `증거금률`은 OpenDART 원문 파싱 결과를 우선 사용한다.
- `확정 공모가`, `일반청약 경쟁률`, `유통가능주식수/비율`, `IR/수요예측 일정`은 KIND 상세를 우선 사용한다.
- 여전히 `기관 수요예측 경쟁률`, `의무보유확약률`은 안정적으로 채우지 못하는 종목이 있을 수 있다.

## 2026-03-22

### Thread Summary

이번 스레드에서는 서비스 핵심 운영 흐름인 `매일 공모주 데이터 업데이트`, `마감 당일 10시 분석 메일`, `마감 30분 전 리마인더 메일`을 중심으로 점검하고, 관리자 수동 동기화 버튼과 운영 검증 UI를 추가했으며, 수동 최신화 후 상세 캐시 반영 문제까지 후속 수정했다.

### What Happened

1. `vercel.json`, 잡 API, 운영 로그 흐름을 다시 읽어 현재 배치가 언제 실행되고 무엇으로 검증되는지 확인했다.
2. 관리자 화면에서 `06:00 daily-sync`, `09:00 prepare-daily-alerts`, `10:00 dispatch-alerts` 기준 실행 여부를 `정상 / 대기 / 지연 / 미실행 / 실패`로 보여주는 스케줄 검증 패널을 추가했다.
3. 관리자 화면에 `최신 데이터 가져오기` 버튼을 추가해 강제 새로고침 기반 `daily-sync`를 수동 실행할 수 있게 했다.
4. 수동 동기화 결과는 운영 로그 `admin:daily-sync`로 남기고, 성공/실패 배너를 관리자 화면에 표시하도록 연결했다.
5. `마감 당일 10시 분석 메일` 흐름을 코드/DB/운영 로그 기준으로 다시 검증했다.
6. `마감 30분 전 메일`은 기존에 구현돼 있지 않음을 확인하고, 기존 10시 메일과 분리된 별도 준비/발송 경로로 추가했다.
7. `15:25 prepare-closing-alerts`, `15:30 dispatch-closing-alerts` 크론과 전용 API route, 로컬 실행 스크립트를 추가했다.
8. 마감 30분 전 메일은 제목/본문을 별도 구성으로 만들고, `closing-soon-reminder` idempotency key를 사용하게 했다.
9. 리마인더 메일은 `16:00` 이후 늦게 발송되지 않도록 차단 로직을 넣었다.
10. 전체 코드리뷰를 통해 핵심 기능 관련 운영 리스크를 다시 점검했고, 그 과정에서 수동 최신화 후 상세 페이지 캐시가 남는 문제를 확인했다.
11. 후속으로 `page-data` 캐시를 tag 기반으로 정리하고, 관리자 수동 동기화 시 홈/상세 캐시를 즉시 무효화하도록 `updateTag`를 추가했다.
12. `마감 30분 전 메일에 주관사별 경쟁률, 5사 6입 고려 청약금액을 넣을지`는 다음 스레드 개선 항목으로 남겼다. 현재 구현에는 포함되지 않는다.

### Main Code Changes

- 관리자 운영 / 수동 동기화
  - `src/app/admin/page.tsx`
  - `src/app/admin/page.module.scss`
  - `src/app/admin/actions.ts` 추가
- 잡 / 메일 / 운영 검증
  - `src/lib/jobs.ts`
  - `src/lib/types.ts`
  - `src/lib/fallback-data.ts`
  - `src/lib/page-data.ts`
- 신규 잡 API
  - `src/app/api/jobs/prepare-closing-alerts/route.ts` 추가
  - `src/app/api/jobs/dispatch-closing-alerts/route.ts` 추가
- 로컬 실행 스크립트 / 설정
  - `scripts/prepare-closing-alerts.ts` 추가
  - `scripts/dispatch-closing-alerts.ts` 추가
  - `package.json`
  - `vercel.json`

### Verification In This Thread

- `npm run lint`
- DB / 운영 로그 조회로 확인:
  - `CLOSING_DAY_ANALYSIS` 구독과 관리자 이메일 채널 존재 확인
  - `prepare-daily-alerts`, `dispatch-alerts` 최근 운영 로그 확인
  - `notificationJob`, `notificationDelivery`, `operationLog` 비교 점검
- 수동 최신화 후 캐시 반영 로직은 `updateTag(public-home-snapshot/public-ipo-detail)` 기준으로 연결 상태를 확인했다.

### Review Findings To Remember

1. Vercel Hobby 플랜에서는 `15:25`/`15:30` 크론의 분 단위 정확도가 보장되지 않을 수 있다.
2. `prepareClosingSoonAlerts()`는 `16:00` 이후 빈 배열을 반환하므로, 지연 실행 시 기존 `READY` 리마인더 잡 정리 정책이 별도로 필요하다.
3. `delivery_failed` 로그 source가 아직 `job:dispatch-alerts`로 남아 있어 리마인더 실패와 10시 메일 실패가 구분되지 않는다.

### Current Decisions To Remember In This Thread

- `마감 30분 전 메일`은 기존 10시 분석 메일을 덮어쓰지 않고 별도 크론/별도 API/별도 idempotency key로 분리한다.
- 수동 최신화는 관리자 인증 후에만 실행되며, 홈과 상세 캐시를 함께 무효화해야 한다.
- 현재 30분 전 메일에는 `주관사별 경쟁률`과 `5사 6입 고려 청약금액`이 들어가지 않는다.
- 위 두 항목은 다음 스레드에서 데이터 구조 설계와 함께 개선한다.

### Follow-up: Deployment Type Error Fix

배포 중 `next build` 타입 체크에서 `PreparedJobSeed[]`를 `NotificationJobRecord[]`로 반환하던 fallback 경로 때문에 실패한 문제를 후속으로 수정했다.

### What Changed In This Follow-up

1. `prepare-daily-alerts` fallback 반환값이 `NotificationJobRecord[]` 타입을 만족하도록 임시 job에도 `id`를 부여했다.
2. `prepare-closing-alerts` fallback 반환값도 동일하게 `id`를 포함하도록 맞췄다.
3. 두 준비 함수 모두 fallback / database 경로에서 반환 타입이 일관되도록 정리했다.

### Main Code Changes In This Follow-up

- 잡 fallback 타입 정합성
  - `src/lib/jobs.ts`

### Verification In This Follow-up

- `npm run lint`
- `npm run build`

### Verified Error In This Follow-up

- 배포 에러 로그:
  - `Type 'PreparedJobSeed[]' is not assignable to type 'NotificationJobRecord[]'`
  - 원인: fallback 경로 `jobs` 배열에 `id`가 없어 `NotificationJobRecord` 타입을 만족하지 못함
  - 수정 후 build 통과 확인

### Follow-up: Deployment Admin Env Diagnosis / Secret Guidance

배포 후 웹 로그인 화면에서 관리자 설정 미완료 메시지가 보인다는 점을 다시 확인했고, 로컬 코드는 정상적으로 env를 읽고 있음을 검증했다. 이 스레드에서는 런타임에서 어떤 키가 비어 있는지 더 구체적으로 보이게 진단 메시지를 보강하고, `JOB_SECRET` / `ADMIN_SESSION_SECRET` / `ADMIN_ACCESS_PASSWORD` 운영 가이드를 정리했다.

### What Changed In This Follow-up

1. 로컬 런타임에서 `ADMIN_ACCESS_PASSWORD`, `ADMIN_SESSION_SECRET` 모두 정상 인식되는지 길이/존재 여부 기준으로 확인했다.
2. 로그인 페이지에서 관리자 env가 빠졌을 때 단순 공통 문구 대신 실제로 비어 있는 키 이름을 표시하도록 개선했다.
3. 배포 환경에서 문제가 날 경우 원인이 코드보다 `Vercel Production env 적용 / redeploy 여부 / 최신 배포 확인` 쪽일 가능성이 높다는 점을 정리했다.
4. `JOB_SECRET`는 배포 환경에서도 `.env`와 같은 값을 사용해도 되지만, 로컬/배포 모두 동일한 강한 랜덤 secret으로 관리해야 한다는 운영 원칙을 남겼다.
5. `JOB_SECRET`, `ADMIN_SESSION_SECRET`, `ADMIN_ACCESS_PASSWORD`에 대해 길이와 난수성 기준을 포함한 권장 강도를 정리했다.

### Main Code Changes In This Follow-up

- 관리자 env 진단
  - `src/lib/admin-auth.ts`
  - `src/app/login/page.tsx`

### Verification In This Follow-up

- `npx tsx`로 로컬 런타임 env 인식 여부 확인:
  - `ADMIN_ACCESS_PASSWORD` 존재 / 길이 확인
  - `ADMIN_SESSION_SECRET` 존재 / 길이 확인
  - `isAdminAuthConfigured() === true` 확인
- `npm run lint`
- `npm run build`

### Current Decisions To Remember In This Follow-up

- Vercel Project Settings에 `ADMIN_ACCESS_PASSWORD`, `ADMIN_SESSION_SECRET`, `JOB_SECRET`를 환경변수로 저장하는 것은 일반적인 운영 방식이며, 코드에 하드코딩하거나 `.env`를 커밋하는 것보다 안전하다.
- 다만 반드시 `Production` 적용 여부와 redeploy 여부를 함께 확인해야 한다.
- `JOB_SECRET`는 최소 32자 이상 랜덤 문자열, `ADMIN_SESSION_SECRET`는 최소 32자 이상이며 가능하면 64자 수준의 랜덤 문자열을 권장한다.
- `ADMIN_ACCESS_PASSWORD`는 사람이 입력하는 값이므로 길고 예측 어려운 passphrase 형태를 권장한다.
