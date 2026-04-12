# Runtime And Ops

## Required Runtime Rules

- 작업 전 항상 `source ~/.nvm/nvm.sh && nvm use`
- Node version: `v24.14.0`
- 시간대 기준은 항상 `Asia/Seoul`
- 오래된 Node 버전은 `tsx`, `next build`를 깨뜨릴 수 있음

## Main Scheduled Jobs

1. `daily-sync`
2. `prepare-daily-alerts`
3. `dispatch-alerts`
4. `prepare-closing-alerts`
5. `dispatch-closing-alerts`

## Current Server Layout

- `src/lib/jobs.ts`는 기존 import 경로를 유지하기 위한 얇은 facade다.
- `src/lib/server/ipo-sync-service.ts`는 source fetch, normalize, DB upsert, stale 처리와 점수 hook을 담당한다.
- `src/lib/server/ipo-read-service.ts`는 dashboard/public/detail/admin read model을 담당한다.
- `src/lib/server/alert-service.ts`는 alert prepare/dispatch와 메일 render를 담당한다.
- `src/lib/server/recipient-service.ts`는 관리자 수신자 CRUD를 담당한다.
- `src/lib/admin-navigation.ts`와 `src/lib/server/admin-surface.ts`는 admin login redirect, next-path 정규화, admin 경로 revalidate 규칙을 공통화한다.
- `src/lib/page-data-revival.ts`는 cached public snapshot/detail payload의 날짜 필드와 fallback scoreDisplay 복원을 담당한다.
- `src/lib/server/ipo-mappers.ts`는 snapshot payload parsing과 read mapper를 담당한다.
- `src/lib/server/job-shared.ts`는 scheduler 상수와 공용 helper/select를 담는다.

## Current Operational Flow

1. `runDailySync()` facade 호출
2. source fetch + merge + normalization
3. DB upsert + stale 처리
4. score artifact sync hook + recalculation hook
5. alert payload preparation
6. recipient resolve + delivery

## Important Scheduling Notes

- `daily-sync` 기본 실행: `06:00 KST`
- listing-day opening price capture:
  - `10:10 KST`
  - `10:30 KST`
- alert 준비 잡은 최근 `90분` 내 성공한 `daily-sync`가 없으면 강제 refresh를 먼저 시도
- 다만 이미 `daily-sync`가 진행 중이면 새 refresh를 바로 시작하지 않고 기존 실행 완료를 대기
- 최근 `daily-sync`가 방금 실패한 경우 alert job은 즉시 같은 강제 refresh를 반복하지 않고 cooldown 뒤 다음 실행으로 넘김
- dispatch 잡은 같은 날 저장된 `READY` mail job이 있으면 prepare를 다시 돌지 않고 기존 job을 우선 재사용

## Public Read Path Rules

- 홈 `/`는 `revalidate = 300`
- 공개 read path에서는 recipient bootstrap 등 DB write를 하지 않음
- 관리자 read와 public read는 분리된 경로를 사용
- 공개 홈은 운영용 메타데이터(활성 수신자 수, READY 잡 수, DB/Fallback 상태)를 노출하지 않음
- public cache wrapper는 `src/lib/page-data.ts`, revive 규칙은 `src/lib/page-data-revival.ts`에 분리돼 있다

## Alert Gate Rules

- 자동 알림 대상 제외:
  - 종목명 기준 스팩
    - `기업인수목적`
    - `스팩`
    - `SPAC`
- 자동 알림 차단 필수값:
  - `offerPrice`
  - `refundDate`
  - `leadManager`
- `listingDate`가 비어도 자동 발송은 유지
  - 대신 `데이터 상태: 일부 미확인`

## Auth / Security

- admin auth:
  - [src/lib/admin-auth.ts](/Users/shs/Desktop/Study/ipo/src/lib/admin-auth.ts)
  - [src/lib/admin-login-throttle.ts](/Users/shs/Desktop/Study/ipo/src/lib/admin-login-throttle.ts)
  - [src/lib/admin-navigation.ts](/Users/shs/Desktop/Study/ipo/src/lib/admin-navigation.ts)
  - [src/lib/server/admin-surface.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/admin-surface.ts)
  - [src/app/login/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/login/page.tsx)
  - [src/app/login/actions.ts](/Users/shs/Desktop/Study/ipo/src/app/login/actions.ts)
- 관리자 로그인:
  - `next` redirect는 `/admin` 및 하위 경로만 허용
  - `10분 내 5회` 실패 시 `15분` 잠금
  - 현재 limiter는 프로세스 메모리 기반이므로 다중 인스턴스 전역 공유는 아님
- 잡 API 인증:
  - Vercel Cron: `Authorization: Bearer <CRON_SECRET>`
  - 수동 호출: `x-job-secret: <JOB_SECRET>`
  - `?secret=` query-string 인증은 더 이상 지원하지 않음
- 필수 env:
  - `ADMIN_ACCESS_PASSWORD`
  - `ADMIN_SESSION_SECRET`
  - `ADMIN_EMAIL`
  - `CRON_SECRET`
  - `JOB_SECRET`
- `.env`는 커밋하지 않음

## Main Env Vars

- `DATABASE_URL`
- `APP_BASE_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `IPO_SOURCE_URL`
- `OPENDART_API_KEY`
- `SEIBRO_SERVICE_KEY`

## Logs And Debugging

중요 로그 파일:

- [src/lib/ops-log.ts](/Users/shs/Desktop/Study/ipo/src/lib/ops-log.ts)
- [src/app/admin/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/admin/page.tsx)
- [src/app/admin-log-panel.tsx](/Users/shs/Desktop/Study/ipo/src/app/admin-log-panel.tsx)

디버깅 순서:

1. `/admin`
2. Vercel function logs
3. `notification_job` / `notification_delivery`
4. `OperationLog`

관리자 로그인 로그 해석 포인트:

- `admin:login`
  - `invalid_password`: 잘못된 비밀번호 제출
  - `rate_limited`: 로그인 시도 과다로 일시 차단
  - `authenticated`: 로그인 성공
- 로그인 관련 `context.clientAuditKey`는 원문 IP 대신 짧은 감사용 해시 키다.

알림 로그 해석 포인트:

- `job:prepare-daily-alerts`, `job:prepare-closing-alerts`
  - `alert_candidate_summary`: 당일 마감 종목 수, 스팩 제외 수, 발송 보류 수, 준비 완료 수를 함께 기록
  - `no_alert_candidates`: 당일 기준 발송 대상 종목 자체가 없어서 준비된 메일이 없음을 의미
- `job:dispatch-alerts`, `job:dispatch-closing-alerts`
  - `dispatch_selection_summary`: 실제 발송 직전의 due job 수, dispatchable job 수, stale job 수, 수신자/이메일 채널 수를 기록
  - `no_dispatchable_jobs`: 스케줄은 정상 실행됐지만 실제 전송 가능한 READY 메일이 없어 메일을 보내지 않았음을 의미
- `completed` 메시지는 이제 `0건`일 때도 실제 메일이 없었다는 뜻이 드러나도록 남긴다.
- `/admin` 운영 로그 패널에서는 `context` JSON을 pretty-print로 보여 주므로, 후보 종목명과 제외/보류 사유를 화면에서 바로 확인할 수 있다.
- `/admin` 스케줄 상태 카드는 같은 날 재실행이 여러 번 있어도, 예정 시각 임계값 이후 가장 먼저 성공/실패한 실행을 대표 런으로 본다. 더 늦은 재실행은 `최근 성공`에는 반영되지만 지연 판정 기준 자체를 덮어쓰지 않는다.

## Current Operational Caveats

- 홈 `/`는 `revalidate = 300`
- 공개 점수 rollout은 현재 pause 상태이며, public read path는 `ipo_score_snapshot`을 붙이지 않음
- `src/lib/jobs.ts`는 facade만 남았고, 점수 sync / 재계산 no-op helper는 현재 `src/lib/server/ipo-sync-service.ts`에 있다
- admin score summary data는 남겨 두지만, 현재 UI는 숨겨져 있고 재오픈 전까지 최신성 보장을 전제로 두지 않는다
- `daily-sync`는 transaction start 실패를 줄이기 위해 종목별 DB 반영을 순차 처리한다
