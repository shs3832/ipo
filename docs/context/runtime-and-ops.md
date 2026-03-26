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

## Current Operational Flow

1. `fetchSourceRecords()`
2. source merge and normalization
3. DB upsert
4. score artifact sync + recalculation
5. alert payload preparation
6. recipient delivery

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

- 공개 캐시는 점수 재계산 직후 최대 `5분` stale 할 수 있음
- scoring store는 runtime mismatch 시 fail-soft 하도록 되어 있음
- 개발 환경에서 `publicScore`가 많이 비면 먼저 Prisma client mismatch를 의심
