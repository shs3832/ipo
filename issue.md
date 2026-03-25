# Issue Log

## 2026-03-25

### Follow-up: Alert Gate Listing Date Relaxation

자동 메일의 발송 차단 필수값에서 `상장 예정일`을 제외했다. 이제 `확정 공모가`, `환불일`, `주관사`가 자동 발송 기준 핵심 정보이고, `상장 예정일`이 비어 있으면 발송 보류 대신 `데이터 상태: 일부 미확인`으로 처리한다. 이 기준으로 `ipo-data-quality` 테스트와 운영 문서도 함께 맞췄다.

### Files Touched In This Follow-up

- `src/lib/ipo-data-quality.ts`
- `tests/ipo-data-quality.test.ts`
- `README.md`
- `AGENTS.md`
- `agent.md`

### Follow-up: KIND Listing Coverage / Listing Open Price / Alert Quality Gate / Docs Sync

이번 스레드에서는 참고 캘린더와 상장 일정을 더 가깝게 맞추기 위해 KIND `공모일정(상장)` 소스를 추가로 붙였고, 상장 당일 시초가를 자동으로 캡처하는 경로를 보강했다. 이어서 메일은 아무 데이터로나 보내지 않도록 `핵심 정보 검증` 게이트를 넣고, 공개 상세에도 현재 검증 상태를 함께 노출하도록 정리했다.

### What Changed In This Follow-up

1. KIND `공모일정` 캘린더에서 `상장` 일정을 직접 읽는 `kind-listing-schedule` 소스를 추가하고, `daily-sync`가 OpenDART 레코드에 KIND 상장일을 우선 병합하도록 바꿨다.
2. 기존 `KIND 신규상장기업현황`만으로는 놓치던 `케이뱅크`, `에스팀`, `액스비스` 같은 상장 일정이 DB와 공개 스냅샷에 반영되도록 보강했다.
3. KIND 상세의 `상장일`이 이미 캘린더에서 확인한 `상장예정일`을 다시 덮어쓰지 않도록 순서를 정리했고, KIND 상세에서 확인된 시장 구분도 기존 레코드에 병합되게 했다.
4. KIND 시세 파서를 현재 응답 형식인 `* YYYY-MM-DD HH:mm:ss 기준`까지 읽도록 수정했고, 상장일 당일 `10:00 KST` 이후에는 같은 날도 시초가를 캡처할 수 있게 했다.
5. `daily-sync` 크론을 `06:00 KST` 기본 동기화 외에 `10:10 KST`, `10:30 KST`에도 추가 실행하도록 바꿔 상장일 시초가와 공모가 대비 수익률을 자동 저장하게 했다.
6. `ipo-data-quality` 평가기를 추가해 `확정 공모가`, `환불일`, `상장 예정일`, `주관사` 중 하나라도 비면 자동 메일 발송을 보류하게 했다.
7. `prepare-daily-alerts`, `prepare-closing-alerts`는 알림 준비 전에 최근 `90분` 내 `daily-sync` 성공 로그가 없으면 먼저 `runDailySync({ forceRefresh: true })`를 수행하도록 바꿨다.
8. 메일 payload와 상세 페이지에 `데이터 상태`를 노출해 `검증 완료 / 일부 미확인 / 발송 보류`를 구분하고, 어떤 항목이 확인됐는지 또는 추가 검증 중인지 같이 안내하게 했다.
9. 홈 캘린더 안내 문구도 현재 운영 기준에 맞춰 `06:00` 기본 갱신 + `10:10/10:30` 시초가 추가 확인으로 갱신했다.
10. 이번 동작과 현재 한계를 다음 작업자가 바로 이어받을 수 있도록 `README.md`, `AGENTS.md`, `agent.md`를 현재 기준으로 동기화했다.

### Main Code Changes In This Follow-up

- KIND 상장 일정 보강
  - `src/lib/sources/kind-listing-schedule.ts`
  - `src/lib/sources/kind-offer-details.ts`
  - `src/lib/jobs.ts`
  - `tests/kind-listing-schedule.test.ts`
  - `tests/kind-offer-details.test.ts`
- 상장일 시초가 캡처
  - `src/lib/sources/kind-stock-prices.ts`
  - `src/lib/date.ts`
  - `src/lib/jobs.ts`
  - `vercel.json`
  - `tests/kind-stock-prices.test.ts`
- 알림 데이터 품질 게이트 / 상세 표시
  - `src/lib/ipo-data-quality.ts`
  - `src/lib/jobs.ts`
  - `src/app/home-content.tsx`
  - `src/app/ipos/[slug]/page.tsx`
  - `tests/ipo-data-quality.test.ts`
- 문서
  - `issue.md`
  - `README.md`
  - `AGENTS.md`
  - `agent.md`

### Verified Root Cause In This Follow-up

- 상장 일정이 `2~3건`만 보이던 직접 원인은, 기존 흐름이 `KIND 신규상장기업현황`만 참고하고 `KIND 공모일정(상장)`을 읽지 않던 구조였다.
- 상장일 시초가가 잘 안 잡히던 직접 원인은 KIND 시세 응답 포맷이 `종가 기준`에서 `HH:mm:ss 기준`으로 바뀌었는데 파서가 이를 반영하지 못했고, 같은 날 상장은 아예 캡처 조건에서 제외하고 있던 점이었다.
- 알림 쪽은 DB가 없는 fallback 상태나 오래된 동기화 상태에서도 payload를 만들 수 있었고, 핵심 일정/공모가/주관사 누락 여부를 명시적으로 검사하지 않고 있었다.

### Verification In This Follow-up

- `npm test`
  - `12` tests passed
- `npx tsc --noEmit`
- `npm run lint`
  - 기존 `src/lib/sources/opendart-prospectus.ts` unused helper warning `3건`만 유지
- 2026년 3월 상장 일정 DB / 공개 스냅샷 대조
  - `2026-03-05` 케이뱅크
  - `2026-03-06` 에스팀
  - `2026-03-09` 액스비스
  - `2026-03-16` 카나프테라퓨틱스
  - `2026-03-20` 아이엠바이오로직스
  - `2026-03-25` 한패스
  - `2026-03-26` 메쥬
  - `2026-03-27` 엔에이치기업인수목적33호
  - `2026-03-27` 코스모로보틱스
  - `2026-03-31` 리센스메디컬
- 상장일 시초가 QA
  - `한패스`가 `listingOpenPrice = 37,100원`, `listingOpenReturnRate = 95.3%`로 저장되는 것 확인

### Current Decisions To Remember In This Follow-up

- 상장 일정의 기준은 이제 `KIND 공모일정(상장)`을 우선 참고하고, OpenDART는 일정 생성보다 공시/재무 보강 성격으로 다룬다.
- 상장일 시초가는 기본 sync와 분리하지 않고 `10:10 KST`, `10:30 KST` 추가 sync로 캡처한다.
- 알림은 “보낼 수 있는 메일을 최대한 다 보내기”보다 “핵심 정보가 검증된 메일만 보내기”가 우선이다.
- `확정 공모가`, `환불일`, `상장 예정일`, `주관사` 중 하나라도 비면 자동 알림은 생성하지 않고 운영 로그에 남긴다.
- 공개 상세와 메일의 `데이터 상태` 표기는 같은 평가기를 공유해 서로 다른 메시지를 만들지 않는다.

### Remaining Gaps / TODO

- KIND 캘린더에만 있고 `searchListingTypeSub` / KIND 상세와 즉시 연결되지 않는 `schedule-only` 종목은 아직 완전한 KIND-first ingest가 아니다.
- `kind-listing-schedule`는 현재 캘린더 행의 시장 badge를 읽지 않아, 상세 보강이 안 붙는 일정은 `기타법인`으로 남을 수 있다.
- 상장일 시초가는 `10:10`과 `10:30` 두 번 재시도하지만, KIND 지연이 더 길면 놓칠 수 있어 `11:00` 추가 재시도는 운영 옵션으로 남아 있다.

## 2026-03-24

### Thread Summary

운영 로그에 반복적으로 찍히던 잡 API `unauthorized` 경고를 분석했고, Vercel Cron 인증 방식과 현재 앱 인증 방식이 어긋나 있던 문제를 수정했다. 이어서 메일 발송 경로를 fail-closed로 보강하고, 마감 임박 알림의 운영 판단을 다시 정리해 최종적으로 `15:30 KST` 기준을 유지하도록 되돌렸다.

### What Happened

1. `2026-03-24` 운영 로그와 `OperationLog` DB를 직접 확인해 `/api/jobs/daily-sync`, `/api/jobs/prepare-daily-alerts`, `/api/jobs/dispatch-alerts`, `/api/jobs/prepare-closing-alerts`, `/api/jobs/dispatch-closing-alerts` 호출이 모두 `unauthorized`로 차단되고 있었음을 확인했다.
2. 원인을 추적한 결과, 앱은 `JOB_SECRET` 또는 `x-vercel-cron` 기반 인증을 기대하고 있었지만 실제 운영 기준으로는 Vercel 공식 방식인 `Authorization: Bearer <CRON_SECRET>`을 지원해야 한다는 점을 정리했다.
3. 잡 인증을 `CRON_SECRET` 우선 + `JOB_SECRET` 수동 호출 fallback 구조로 바꾸고, 단순 `x-vercel-cron` 헤더 신뢰는 제거했다.
4. 잡 route 로그에 `cronSecretConfigured`, `jobSecretConfigured`, `hasAuthorizationHeader`, `authMethod` 같은 진단 컨텍스트를 남기도록 보강했다.
5. 문서도 현재 운영 기준에 맞춰 `CRON_SECRET`, `JOB_SECRET`, `ADMIN_EMAIL`, `SMTP_*` 요구사항을 다시 정리했다.
6. 추가 코드 리뷰 과정에서 `ADMIN_EMAIL`이 없을 때 placeholder 주소로 조용히 진행될 수 있는 점, SMTP 미설정 시 preview를 성공처럼 처리하던 점, 수신자가 없는데도 발송 잡이 계속 완료될 수 있는 점을 발견했다.
7. 위 메일 관련 경로를 fail-closed로 바꿔, `ADMIN_EMAIL` 또는 `SMTP_*`가 없으면 준비/발송 잡이 분명하게 실패하도록 수정했다.
8. `dispatch-alerts` / `dispatch-closing-alerts`는 내부 발송 실패가 있을 때 API 응답도 `500`으로 반환하게 바꿔, Vercel 쪽에서도 장애 신호를 바로 볼 수 있게 했다.
9. 마감 임박 알림은 한때 `15:00` 윈도우 처리로 조정했지만, 실제 제품 판단상 의미 있는 막판 판단 시각은 `15:30`이라는 결론에 따라 최종적으로 다시 `15:30 KST` 기준으로 복원했다.

### Main Code Changes

- 잡 인증 / env
  - `src/lib/job-auth.ts`
  - `src/lib/env.ts`
- 잡 API route
  - `src/app/api/jobs/daily-sync/route.ts`
  - `src/app/api/jobs/prepare-daily-alerts/route.ts`
  - `src/app/api/jobs/dispatch-alerts/route.ts`
  - `src/app/api/jobs/prepare-closing-alerts/route.ts`
  - `src/app/api/jobs/dispatch-closing-alerts/route.ts`
- 잡/메일 로직
  - `src/lib/jobs.ts`
  - `src/lib/types.ts`
- 운영 문서 / 예제 env
  - `.env.example`
  - `README.md`
  - `AGENTS.md`

### Verified Root Cause

- 반복된 `unauthorized` 경고의 직접 원인은 잡 호출 인증 불일치였다.
- 기존 코드는 `JOB_SECRET` 수동 호출과 `x-vercel-cron` 헤더를 기준으로 판단했고, Vercel 공식 `Authorization: Bearer <CRON_SECRET>` 검증이 없었다.
- 그 결과 배포 환경에서 실제 크론 호출 또는 크론처럼 보이는 호출이 들어와도 앱 기준으로는 인증 실패로 차단될 수 있었다.

### Verification

- `OperationLog` DB 직접 조회
  - `2026-03-24` 기준 `api:* unauthorized` 반복 패턴 확인
  - 대응하는 `job:* completed` 부재 확인
- `npm run lint`
- `npm run build`
- 로컬 프로덕션 서버(`npm run start`) 기동 후 인증 테스트
  - 무인증 `daily-sync` 호출: `401 Unauthorized`
  - `Authorization: Bearer <CRON_SECRET>` 포함 `daily-sync` 호출: `200`, `authMethod: vercel-cron-secret` 확인
- 로컬 프로덕션 서버에서 fail-closed 테스트
  - `ADMIN_EMAIL` 비움 + `prepare-daily-alerts` 호출: `500`
  - `ADMIN_EMAIL` 비움 + `daily-sync` 호출: `200` 유지
  - `SMTP_*` 비움 + `dispatch-alerts` 호출: `500`, `failedCount > 0` 응답 확인

### Current Decisions To Remember

- Vercel Cron 자동 실행은 `CRON_SECRET` + `Authorization: Bearer <CRON_SECRET>` 기준으로 인증한다.
- `JOB_SECRET`는 브라우저/스크립트에서 수동으로 잡 API를 호출할 때만 사용한다.
- `ADMIN_EMAIL`은 실제 수신 가능한 주소가 필수이며, 기본 placeholder 값으로 대체하지 않는다.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`이 빠지면 발송 잡은 성공처럼 숨기지 말고 실패로 종료한다.
- 발송 실패가 있으면 잡 내부 로그뿐 아니라 API 응답도 `500`으로 노출해 운영자가 즉시 인지할 수 있게 유지한다.
- 마감 임박 알림은 최종적으로 `15:30 KST` 기준을 유지한다.

### Follow-up: Calendar Today Highlight / Public Score Pause / Docs Sync

이번 스레드에서는 캘린더에서 오늘 날짜를 더 눈에 띄게 표시했고, OpenDART 단독 기반 점수의 신뢰도를 다시 검토한 뒤 공개 화면과 메일에서 정량 점수 노출을 잠시 중단했다. 마지막으로 이 결정이 다음 작업자에게 바로 전달되도록 문서도 함께 동기화했다.

### What Changed In This Follow-up

1. 홈 캘린더에서 `오늘` 날짜를 별도 badge와 강조 배경으로 표시하도록 바꿨다.
2. OpenDART 단독 기반 점수의 신뢰도를 재검토했고, 현재 단계에서는 공개 추천/점수형 노출을 유지하지 않는 쪽이 더 안전하다고 정리했다.
3. 홈 `종목 개요` 카드에서 점수/평가보류 상태를 제거하고, 일정·공모가·주관사 중심의 공시 기반 정보만 보이도록 정리했다.
4. 상세 페이지 히어로의 점수 카드와 점수 문구를 `정량 점수 비공개` + `공시 기반 체크 포인트` 안내로 교체했다.
5. 10시 분석 메일과 마감 임박 메일에서도 점수, 추천형 태그, 점수 공개 기준 문구를 걷어내고 중립적인 체크 포인트 안내로 바꿨다.
6. 점수 로직 자체는 내부에 유지하되, 추가 데이터 소스와 결과 검증 전까지는 public surface에 다시 열지 않기로 했다.
7. 위 정책 변경이 남아 있도록 `issue.md`, `README.md`, `AGENTS.md`, `agent.md`를 현재 상태로 동기화했다.

### Main Code Changes In This Follow-up

- 캘린더 / 홈 UI
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
  - `src/app/page.tsx`
- 상세 페이지
  - `src/app/ipos/[slug]/page.tsx`
- 메일 payload / TODO 메모
  - `src/lib/jobs.ts`
- 문서
  - `issue.md`
  - `README.md`
  - `AGENTS.md`
  - `agent.md`

### Verification In This Follow-up

- `npm run build`

### Current Decisions To Remember In This Follow-up

- 오늘 날짜는 캘린더 셀에서 badge와 강조 스타일로 눈에 띄게 유지한다.
- 정량 점수는 현재 내부 계산만 유지하고, 공개 화면과 메일에는 노출하지 않는다.
- 점수 재공개 전제는 `OpenDART 외 추가 데이터 소스`, `근거 품질 검증`, `라이브 결과 검토`다.
- 현재 public UX의 기본 방향은 `점수형 추천`이 아니라 `공시 기반 체크 포인트`다.

### Follow-up: Rights Offering Exclusion / Calendar Source TODO

참고 캘린더와 대조한 결과, 현재 OpenDART `증권신고서(지분증권)` 베이스에는 실권주·배정형 비IPO 일정이 섞일 수 있음을 다시 확인했다. 우선 `estkRs` 일반사항의 `배정기준일(asstd)`이 있는 건을 실권주/배정형 비IPO로 간주해 캘린더에서 제외하고, 더 근본적인 소스 재설계 항목은 TODO로 남겼다.

### What Changed In This Follow-up

1. OpenDART `estkRs` 일반사항의 `asstd` 값을 보고, 배정기준일이 잡히는 지분증권 일정은 캘린더용 신규 IPO 목록에서 제외하도록 필터를 추가했다.
2. 이 기준으로 `티웨이항공`, `대한광통신`, `에스에너지`, `진양홀딩스`처럼 기존 상장사 지분증권 일정이 캘린더에 섞이던 케이스를 우선 제거한다.
3. `아이엠바이오로직스`, `카나프테라퓨틱스`, `메쥬`, `한패스`, `리센스메디컬`, `인벤테라`, SPAC 계열은 현재 샘플 기준 `asstd = -`라 유지되도록 했다.
4. `asstd`가 `-`면 통과하고 실제 날짜가 있으면 제외되는 단위 테스트를 추가했다.

### Main Code Changes In This Follow-up

- 실권주/배정형 일정 제외 필터
  - `src/lib/sources/opendart-ipo.ts`
- 테스트
  - `tests/opendart-ipo.test.ts`
- 문서 / TODO
  - `issue.md`

### Verification In This Follow-up

- OpenDART `estkRs` 샘플 대조
  - 비IPO 혼입으로 보인 `티웨이항공`, `대한광통신`, `에스에너지`, `진양홀딩스`는 `asstd` 값이 실제 날짜로 내려옴
  - 유지해야 할 IPO 샘플 `아이엠바이오로직스`, `카나프테라퓨틱스`, `메쥬`, `한패스`, `리센스메디컬`, `인벤테라`, SPAC 계열은 `asstd = -`
- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run job:daily-sync -- --force-refresh`

### TODO

- 캘린더 베이스 소스를 OpenDART가 아니라 KIND IPO 일정 계열로 재설계해, KIND에만 있는 `상장` 일정도 신규 레코드로 생성할 수 있게 하기
- OpenDART 비IPO 분류를 `asstd` 1개 신호에서 끝내지 않고 `실권주`, `주주배정후 실권주 일반공모`, `유상증자`, `일반공모` 같은 문구까지 문서 본문 기준으로 세분화하기
- `케이뱅크`, `액스비스`, `에스팀`처럼 KIND에는 있지만 OpenDART 베이스에는 없는 종목을 캘린더에 포함시키는 보강 ingest 추가하기
- 관리자용 검증 화면 또는 배치 리포트를 만들어 “참고 캘린더 대비 누락/과다”를 날짜별로 비교할 수 있게 하기

### Follow-up: Immediate Non-IPO Withdrawal / Docs Sync

실권주·배정형 비IPO를 OpenDART 수집 단계에서 걸러도, `daily-sync`가 그 제외 결과를 직접 쓰지 않으면 기존 DB 레코드가 `2일 유예`만 타고 남아 있었다. 이 스레드에서는 제외 결과를 동기화 경로에 연결해 즉시 `WITHDRAWN` 처리되게 마무리했고, 관련 운영 문서도 현재 동작 기준으로 갱신했다.

### What Changed In This Follow-up

1. `fetchSourceRecords()`가 OpenDART 소스 결과와 함께 `excludedNonIpoSlugs`를 반환하도록 바꿨다.
2. `markStaleDisplayRangeIpos()`가 위 슬러그 목록을 받아, 실권주/배정형 비IPO로 판정된 종목은 `2일 유예` 없이 즉시 `WITHDRAWN` 처리하도록 연결했다.
3. 일반적인 소스 누락은 기존처럼 `2일 유예`를 유지하고, 명시적 비IPO 판정 건만 바로 제외되도록 분기했다.
4. `README.md`, `AGENTS.md`, `agent.md`에 현재 OpenDART 임시 분류 기준과 즉시 제외 동작을 반영했다.

### Main Code Changes In This Follow-up

- 동기화 연결 / 즉시 제외 처리
  - `src/lib/jobs.ts`
- OpenDART 비IPO 제외 결과 반환
  - `src/lib/sources/opendart-ipo.ts`
- 테스트
  - `tests/opendart-ipo.test.ts`
- 문서
  - `issue.md`
  - `README.md`
  - `AGENTS.md`
  - `agent.md`

### Verification In This Follow-up

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
  - 기존 `src/lib/sources/opendart-prospectus.ts` unused var 경고 3건만 유지
- `npm run job:daily-sync -- --force-refresh`
  - `2026-03-24 22:06 KST` 운영 로그에 `withdrew_non_ipo_records` 기록
  - `실권주/배정형 비IPO로 판정된 11건을 캘린더에서 제외했습니다.`
- DB 직접 확인
  - `티웨이항공`, `대한광통신`, `에스에너지`, `진양홀딩스`, `비보존 제약`, `한국첨단소재`, `진양폴리우레탄` 등은 `WITHDRAWN`
  - 표시 범위 활성 종목은 `카나프테라퓨틱스`, `아이엠바이오로직스`, `메쥬`, `한패스`, `리센스메디컬`, `인벤테라` 포함 13건만 남음

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

## 2026-03-22

### Thread Summary

이번 스레드에서는 점수 노출 기준 강화, 근거 부족 시 평가 보류 처리, OpenDART 증권신고서 기반 보강 수집, 상세페이지 정보 재배치, 그리고 퍼센트 표기 오류 수정까지 이어서 정리했다.

### What Happened

1. 점수는 근거가 충분할 때만 보이도록 `scoreDisplay` 정책을 추가하고, 근거 부족 종목은 `평가 보류`로 노출하도록 변경했다.
2. 홈/상세/알림 메시지에서 점수 옆에 근거 문구와 참고용 안내를 함께 표시하도록 맞췄다.
3. 캐시된 예전 `latestAnalysis`에 `scoreDisplay`가 없어 홈에서 크래시 나던 문제를 방어 로직으로 복구했다.
4. 아이엠바이오로직스처럼 상장은 끝났지만 평가 보류로 보이던 종목을 추적한 결과, 핵심 수급/재무 지표 부족이 원인이었음을 확인했다.
5. OpenDART 증권신고서 수집 경로를 viewer 스크래핑에서 공식 `document.xml` 원문 zip 파싱으로 교체했다.
6. 이 경로를 통해 `희망 공모가 밴드`, `최소청약주수`, `증거금률`, 일부 재무 fallback을 점수 계산용으로 보강하도록 연결했다.
7. `fallback prospectus`는 이제 접수번호 단위가 아니라 필드 단위 병합으로 동작해, 최신 정정신고서에 일부 값이 비어 있어도 이전 접수 문서의 보강값을 함께 살릴 수 있게 했다.
8. 외부 원본 + OpenDART 보강이 실패할 때는 조용히 무시하지 않고 `job:daily-sync` WARN 로그를 남기도록 운영 신호를 추가했다.
9. 증권신고서 재무 fallback은 `백만원` 단위를 원단위로 정규화해 기존 OpenDART API 재무 필드와 스케일을 맞췄다.
10. 상세페이지는 `지금 판단용 -> 분석 요약 -> 청약 일정 -> 상세 데이터` 순서로 재배치하고, 중복감이 큰 타임라인은 제거했다.
11. 상세 상단 `지금 판단용` 카드는 데스크톱에서 가로로 길게 펼쳐 보이도록 조정했다.
12. `유통가능물량`은 이미 퍼센트 값으로 저장되고 있었는데 상세에서 다시 `formatPercent()`를 적용해 `1400%`처럼 보이던 표시 버그를 수정했다.

### Main Code Changes

- 점수 노출 / 캐시 호환 / 알림 반영
  - `src/lib/analysis.ts`
  - `src/lib/types.ts`
  - `src/lib/jobs.ts`
  - `src/lib/page-data.ts`
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
  - `src/app/ipos/[slug]/page.tsx`
  - `src/app/ipos/[slug]/page.module.scss`
- OpenDART 증권신고서 보강
  - `src/lib/sources/opendart-prospectus.ts`
  - `src/lib/sources/opendart-ipo.ts`
- 문서
  - `issue.md`
  - `README.md`
  - `AGENTS.md`

### Verification

- `npx tsc --noEmit`
- `npm run build`
- `npm run job:daily-sync -- --force-refresh`

### Current Decisions To Remember

- 숫자 점수는 `총 4개 이상 지표`, `수급 2개 이상`, `재무 1개 이상`일 때만 공개 노출한다.
- 근거 부족 종목은 `평가 보류`로 표시하고, 숨긴 이유를 함께 보여준다.
- 상세페이지는 이제 모든 데이터를 동일 비중으로 나열하지 않고 `지금 판단용 정보`를 최상단에 우선 배치한다.
- `유통가능물량`은 내부적으로 이미 `% 값`으로 저장되므로 UI에서는 추가로 `*100` 성격의 포맷을 다시 적용하면 안 된다.
- OpenDART 증권신고서 보강은 공식 `document.xml` 원문 zip 파싱을 기준으로 유지한다.

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

### Follow-up: Core Flow Code Review Fixes and QA

2026-03-22 08:33 KST 기준으로, 앞선 코드리뷰에서 남아 있던 핵심 이슈 3건을 후속 수정하고 실제 동기화/공개 조회/리마인더 지연 시나리오까지 QA를 다시 진행했다.

### What Changed In This Follow-up

1. `daily-sync`가 `sourceRecords`를 정상 조회해도 기존에 `WITHDRAWN` 처리된 IPO가 checksum 동일 분기에서 그대로 `WITHDRAWN`으로 남던 문제를 수정했다.
2. 이 문제로 인해 `runDailySync({ forceRefresh: true })`는 `synced=16`으로 성공하지만 공개 홈/관리자 대시보드에서는 `status != WITHDRAWN` 필터에 막혀 `ipoCount=0`이 되던 회귀를 복구했다.
3. 공통 메일 발송 함수의 `delivery_failed` 로그 source를 고정값 `job:dispatch-alerts`가 아니라 호출 source를 따르도록 수정했다.
4. `dispatchClosingSoonAlerts()`가 `prepareClosingSoonAlerts()`만 다시 호출하던 구조를 보완해, DB에 남아 있는 당일 `READY` 리마인더 잡도 함께 읽도록 했다.
5. 16시 이후 지연 실행으로 인해 발송할 수 없는 `READY` 리마인더 잡은 더 이상 방치하지 않고 `PARTIAL_FAILURE`로 정리되도록 했다.

### Main Code Changes In This Follow-up

- 핵심 잡 로직
  - `src/lib/jobs.ts`

### Verified Root Cause In This Follow-up

- `upsertDatabaseIpo()`의 checksum 동일 분기에서 실제 DB `status`를 갱신하지 않고 바로 `toIpoRecordFromDb()`를 반환하고 있었다.
- 이 때문에 한 번 `WITHDRAWN` 된 IPO는 동일 소스 데이터가 다시 들어와도 라이브 상태로 복구되지 않았다.
- 공개 홈과 관리자 대시보드는 `getDisplayRangeWhere()`에서 `status != WITHDRAWN`만 조회하므로, 동기화 성공 이후에도 화면상 데이터가 사라질 수 있었다.

### Verification In This Follow-up

- `npm run lint`
- `npm run build`
- `npm run job:daily-sync -- --force-refresh`
  - 결과: `synced=16`, `sourceRecords=16`, `markedWithdrawn=0`
  - 수정 전: 반환된 IPO 상태가 전부 `WITHDRAWN`
  - 수정 후: `UPCOMING` / `CLOSED` 등 정상 상태로 복구 확인
- `npx tsx`로 `getPublicHomeSnapshot()` 재검증
  - 수정 전: `ipoCount=0`
  - 수정 후: `ipoCount=16`
- `npx tsx`로 `getDashboardSnapshot()` 재검증
  - 수정 후: `ipoCount=16`, `withdrawn=0`
- 지연 리마인더 시뮬레이션
  - 테스트용 `READY` closing-soon job을 넣고 16:05 KST 상황으로 `dispatchClosingSoonAlerts()` 실행
  - 결과: `attempted=0`, `staleSkippedCount=1`, 테스트 job status `PARTIAL_FAILURE`

### Current Decisions To Remember In This Follow-up

- `WITHDRAWN` 복구는 checksum이 같아도 반드시 DB `status`를 라이브 상태로 맞춘 뒤 반환해야 한다.
- 30분 전 리마인더는 “prepare 결과만” 믿지 말고, 지연 실행 시 DB에 남아 있던 당일 `READY` job도 함께 정리해야 한다.
- `delivery_failed` 같은 운영 로그는 공통 함수 안에서도 실제 호출 source를 유지해야 관리자 화면에서 원인 추적이 가능하다.

### Follow-up: WITHDRAWN Grace Review Fix / Docs Sync

이번 스레드에서는 코드리뷰에서 잡힌 `WITHDRAWN` 유예 로직 회귀를 수정했고, 실제 동작에 맞게 운영 문서도 함께 동기화했다.

### What Changed In This Follow-up

1. `markStaleDisplayRangeIpos()`가 `sourceSnapshots[0].fetchedAt`를 마지막 확인 시각처럼 쓰고 있었지만, 실제로는 checksum이 바뀔 때만 snapshot이 쌓이므로 unchanged IPO에서는 stale timestamp가 남는다는 점을 다시 확인했다.
2. 새 DB 컬럼을 추가하는 대신, checksum이 같아 새 snapshot을 만들지 않는 sync에서도 최신 `ipoSourceSnapshot.fetchedAt`을 현재 sync 시각으로 갱신하도록 바꿨다.
3. 그 결과 stale-source `WITHDRAWN` 유예는 이제 “마지막으로 소스에서 본 시각” 기준으로 `2일` 보호가 적용되도록 정리됐다.
4. KST 날짜 경계 비교를 재사용 가능한 helper로 분리하고, 최근 확인 시각이 cutoff 안팎에 걸리는 회귀 테스트를 추가했다.
5. patch에 포함되지 않은 `scripts/verify-opendart-coverage.ts`를 가리키던 `package.json` script는 제거해 clean checkout에서 깨지지 않게 정리했다.
6. `README.md`, `AGENTS.md`에 OpenDART 공시 조회 범위와 `WITHDRAWN` 유예 동작을 현재 코드 기준으로 맞춰 반영했다.

### Main Code Changes In This Follow-up

- stale-source 유예 / last-seen 갱신
  - `src/lib/jobs.ts`
  - `src/lib/date.ts`
- 테스트 / 스크립트 엔트리
  - `tests/opendart-ipo.test.ts`
  - `package.json`
- 문서
  - `issue.md`
  - `README.md`
  - `AGENTS.md`

### Verified Root Cause In This Follow-up

- 유예 기준으로 사용하던 `sourceSnapshots[0].fetchedAt`는 “마지막으로 소스에 보인 시각”이 아니라 “마지막으로 payload가 바뀌어 snapshot이 생성된 시각”에 더 가까웠다.
- `upsertDatabaseIpo()`는 동일 sourceKey + 동일 checksum이면 새 snapshot을 만들지 않으므로, unchanged IPO는 어제도 정상 노출됐어도 며칠 전 timestamp를 계속 들고 있을 수 있었다.
- 이 상태에서 OpenDART가 하루만 일시 누락돼도 첫 누락 sync에서 바로 `WITHDRAWN` 처리될 수 있었다.

### Verification In This Follow-up

- `npx prisma generate`
- `npm test`
- `npm run build`
- `npm run lint`
  - 기존 [src/lib/sources/opendart-prospectus.ts](/Users/shs/Desktop/Study/ipo/src/lib/sources/opendart-prospectus.ts)의 unused helper warning 3건은 유지, 새 lint error는 없음

### Current Decisions To Remember In This Follow-up

- stale withdrawal grace는 “last changed snapshot”이 아니라 “last seen in source” 기준이어야 한다.
- 새 스키마를 늘리지 않아도, unchanged sync에서 최신 snapshot의 `fetchedAt`을 heartbeat처럼 갱신하면 같은 목적을 달성할 수 있다.
- OpenDART 공시 조회 범위는 현재 `두 달 전 시작 ~ 현재달 말`이고, 표시 범위는 계속 `현재달 + 다음달`이다.
- `source:verify:opendart` 같은 보조 스크립트는 파일이 실제로 커밋되기 전에는 `package.json`에 노출하지 않는다.

## 2026-03-22

### Follow-up: Score Visibility Gating / Evidence Messaging

점수 자체보다 신뢰 가능한 노출 기준이 더 중요하다는 판단에 따라, 데이터가 부족한 종목은 숫자 점수를 숨기고 `평가 보류`로 처리하도록 바꿨다. 동시에 홈/상세/메일에서 점수의 근거와 참고용 안내 문구를 함께 보여주도록 정리했다.

### What Changed In This Follow-up

1. 점수 계산 결과에 `scoreDisplay` 메타데이터를 추가해 점수 노출 가능 여부, 반영 지표 수, 수급/재무 근거 개수, 안내 문구를 함께 만들도록 확장했다.
2. 현재 기준은 `총 4개 이상 지표`, `수급 2개 이상`, `재무 1개 이상`이 확보돼야만 점수를 공개 화면에 표시하도록 잡았다.
3. 기준을 충족하지 못하는 경우 숫자 점수 대신 `평가 보류`와 `핵심 데이터 부족` 상태를 홈 카드와 상세 히어로에서 표시하도록 변경했다.
4. 점수가 보일 때는 `참고용 점수`라는 성격과 반영 지표 요약을 함께 보여주고, 점수가 숨겨질 때는 왜 숨겨졌는지 사유를 문구로 설명하도록 바꿨다.
5. 상세 페이지 분석 요약에는 점수 노출 정책 문구와 참고용 disclaimer를 추가했다.
6. 10시 분석 메일과 마감 30분 전 리마인더 메일도 같은 기준을 따르도록 맞춰, 데이터가 부족한 종목은 메일에서도 `점수 평가 보류`로 안내하게 했다.
7. 메일 태그 생성도 점수 노출 가능 여부를 반영해 `#평가보류`, `#데이터보완대기` 상태를 구분하도록 조정했다.

### Main Code Changes In This Follow-up

- 점수 노출 기준 / 근거 메타데이터
  - `src/lib/analysis.ts`
  - `src/lib/types.ts`
- read model / 메일 payload 반영
  - `src/lib/jobs.ts`
  - `src/app/page.tsx`
- 홈 UI
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
- 상세 UI
  - `src/app/ipos/[slug]/page.tsx`
  - `src/app/ipos/[slug]/page.module.scss`

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm run lint -- src/lib/analysis.ts src/lib/types.ts src/lib/jobs.ts src/app/page.tsx src/app/home-content.tsx src/app/home-content.module.scss src/app/ipos/[slug]/page.tsx src/app/ipos/[slug]/page.module.scss`
  - SCSS 2개는 현재 ESLint 설정 대상이 아니라 warning만 발생
- `npm run build`

### Current Decisions To Remember In This Follow-up

- 점수는 “항상 보여주는 값”이 아니라 “근거가 충분할 때만 보여주는 참고 정보”다.
- 근거가 부족한 경우에는 애매한 `50점대 보통`보다 `평가 보류`가 더 신뢰를 높인다.
- 공개 화면과 메일의 점수 정책은 반드시 동일하게 유지한다.
