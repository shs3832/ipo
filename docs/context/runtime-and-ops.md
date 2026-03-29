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

## Public Read Path Rules

- 홈 `/`는 `revalidate = 300`
- 공개 read path에서는 recipient bootstrap 등 DB write를 하지 않음
- 관리자 read와 public read는 분리된 경로를 사용

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
  - [src/app/login/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/login/page.tsx)
  - [src/app/login/actions.ts](/Users/shs/Desktop/Study/ipo/src/app/login/actions.ts)
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

## Current Operational Caveats

- 홈 `/`는 `revalidate = 300`
- 공개 점수 rollout은 현재 pause 상태이며, public read path는 `ipo_score_snapshot`을 붙이지 않음
- `src/lib/jobs.ts`는 facade만 남았고, 점수 sync / 재계산 no-op helper는 현재 `src/lib/server/ipo-sync-service.ts`에 있다
- admin score summary data는 남겨 두지만, 현재 UI는 숨겨져 있고 재오픈 전까지 최신성 보장을 전제로 두지 않는다
