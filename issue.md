# Issue Log

## 2026-04-24

### Thread Summary

이번 스레드에서는 프로젝트 전체 코드를 둘러보고 개선점, 리팩토링, 보안 미비점을 점검한 뒤, 기존 서비스 정상 구동을 최우선 조건으로 `1차 저위험 보안 패치`와 `2차 운영 안정화/구조 개선`을 분리해 적용했다. 작업은 `codex/ipo-security-phase-1`, `codex/ipo-security-phase-2` 브랜치에서 단계별로 진행했고, 각 단계마다 QA gate를 통과한 뒤 다음 단계로 넘어갔다.

### Follow-up: Phase 1 Security Patch / Low-Risk Hardening

1차에서는 기능 동작을 크게 건드리지 않는 범위에서 보안 패치와 로그 민감정보 보호를 적용했다.

### What Changed In Phase 1

1. `next` / `eslint-config-next`를 `16.2.4`, `nodemailer`를 `8.0.5`, `prisma` / `@prisma/client`를 `6.19.3`으로 올렸다.
2. `npm audit fix`로 lockfile의 transitive 취약 패키지를 정리해 `npm audit --audit-level=moderate` 기준 취약점 0건을 확인했다.
3. 상세 페이지의 기존 unused `ReactNode` import를 제거해 lint warning을 없앴다.
4. 공통 secret redaction helper를 추가해 운영 로그 DB 저장과 콘솔 출력에서 `secret`, `password`, `token`, `crtfc_key`, `DATABASE_URL` 성격의 값을 가리도록 했다.
5. OpenDART health check와 `source:check:opendart` 출력에서 `crtfc_key`가 노출되지 않도록 redacted endpoint만 반환하게 했다.
6. production 환경에서 `IPO_SOURCE_URL`은 `https:`만 허용하고, development/test에서는 기존 로컬 URL 사용성을 유지하도록 했다.

### Follow-up: Phase 2 Operational Hardening / Scoped Refactor

2차에서는 1차 QA 통과 후, 공개 데이터 경계와 운영 안정성을 높이되 알림 idempotency, daily-sync 순차 처리, 점수/closing-soon pause 상태는 유지했다.

### What Changed In Phase 2

1. 공개 홈 snapshot의 `ipos`를 full `IpoRecord` 대신 홈에 필요한 공개 요약 타입으로 축소해 public cache 객체 안에 `latestSourceKey`, `sourceFetchedAt`, `latestAnalysis`, co-manager 등 상세/admin 성격 필드가 남지 않도록 했다.
2. 관리자 로그인 throttle을 DB-backed 공유 저장소 우선으로 보강하되, DB 장애 시 기존 process memory throttle로 fallback하고 `throttle_degraded` 운영 로그만 남기도록 했다.
3. 외부 fetch 공통 helper를 추가해 timeout과 retry를 중앙화하고, 우선 OpenDART health check와 `IPO_SOURCE_URL` fetch 경로에 적용했다.
4. source record 검증을 skip-mode로 추가해 필수 필드가 깨진 외부 레코드는 전체 동기화 hard fail 대신 WARN 로그와 함께 건너뛰도록 했다.
5. pause 상태인 closing-soon job route는 이제 disabled no-op 응답도 job 인증을 통과한 호출에만 반환한다. 무인증 호출은 기존 job API와 동일하게 `401`로 차단한다.
6. 테스트가 이미 붙은 순수 helper부터 `alert-delivery`, `ipo-sync-persistence` 모듈로 분리하고, 기존 service 파일의 export 호환은 유지했다.

### Main Code Changes

- 패키지 보안 업데이트
  - `package.json`
  - `package-lock.json`
- secret redaction / env guard / OpenDART health check
  - `src/lib/secret-redaction.ts`
  - `src/lib/env.ts`
  - `src/lib/ops-log.ts`
  - `src/lib/sources/opendart.ts`
- public home projection hardening
  - `src/lib/public-home-snapshot.ts`
  - `src/lib/page-data-revival.ts`
  - `src/lib/types.ts`
- admin login throttle
  - `src/lib/admin-login-throttle.ts`
  - `src/app/login/actions.ts`
- source fetch / validation
  - `src/lib/fetch-with-retry.ts`
  - `src/lib/source-record-validation.ts`
  - `src/lib/server/ipo-sync-service.ts`
- scoped helper refactor
  - `src/lib/server/alert-delivery.ts`
  - `src/lib/server/ipo-sync-persistence.ts`
- paused closing job auth order
  - `src/app/api/jobs/prepare-closing-alerts/route.ts`
  - `src/app/api/jobs/dispatch-closing-alerts/route.ts`
- 테스트
  - `tests/env.test.ts`
  - `tests/secret-redaction.test.ts`
  - `tests/opendart-health.test.ts`
  - `tests/admin-login-throttle.test.ts`
  - `tests/public-home-snapshot.test.ts`
  - `tests/page-data-revival.test.ts`
  - `tests/fetch-with-retry.test.ts`
  - `tests/source-record-validation.test.ts`

### Live Service Impact Assessment

- 영향도: 중간, 보수적/긍정적
- 이유:
  - Next/Nodemailer/Prisma patch update와 `npm audit fix`가 포함돼 dependency 레벨 영향은 있지만, major upgrade와 DB migration은 하지 않았다.
  - 공개 홈은 렌더링에 필요한 필드는 유지하고 cache payload만 축소했으므로 공개 UI 동작은 유지하면서 노출 경계를 좁혔다.
  - 로그인 throttle은 DB 공유 저장소를 우선 사용하지만 DB가 실패해도 memory fallback으로 로그인 자체가 막히지 않게 했다.
  - 외부 source 검증은 hard fail이 아니라 skip-mode라, 일부 깨진 레코드가 전체 `daily-sync`를 깨뜨릴 가능성을 낮춘다.
  - closing-soon 알림은 계속 pause 상태이며, 자동/수동 발송 재개는 하지 않았다.
  - 공개 점수 rollout도 계속 pause 상태로 유지했다.

### Verification

- 1차 QA
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `npm audit --audit-level=moderate`
  - production server smoke: `/`, `/login`, job route unauthorized/wrong secret, paused closing route no-op, `source:check:opendart` redaction 확인
- 2차 QA
  - `npm test`
    - 전체 `97개` 테스트 통과
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `npm audit --audit-level=moderate`
    - 취약점 `0건`
  - production server smoke:
    - `/` 200
    - `/login` 200
    - `/api/jobs/daily-sync` 무인증/잘못된 secret `401`
    - `/api/jobs/prepare-closing-alerts` 무인증 `401`
    - `/api/jobs/prepare-closing-alerts` 유효 `x-job-secret` header 기준 disabled no-op `200`
    - `source:check:opendart` 출력의 `crtfc_key` redaction 확인

### Current Decisions To Remember

- 기존 기능 보장을 위해 major dependency upgrade, DB migration, 점수 공개 재오픈, closing-soon 재오픈은 하지 않았다.
- `PublicHomeSnapshot`은 이제 공개 홈 요약 타입만 담아야 하며, admin/source metadata를 nested IPO payload에 다시 넣지 않는다.
- 관리자 로그인 제한은 DB-backed 공유 저장소 우선, 장애 시 memory fallback이다.
- source record validation은 운영 안정성을 위해 skip-mode이며, invalid record가 있어도 전체 동기화를 바로 실패시키지 않는다.
- pause 상태인 closing-soon job API도 인증 없는 호출에는 disabled no-op을 반환하지 않는다.

## 2026-04-21

### Thread Summary

이번 스레드에서는 사용자가 실제로 받은 `10시 분석 메일`, `마감 30분 전 메일`의 도착 시각이 늦다는 제보를 기준으로, 운영 로그와 `notification_job` / `notification_delivery.sentAt`를 직접 확인해 실제 발송 시점을 추적했다. 확인 결과 메일 서버가 오래 지연된 것이 아니라 `dispatch-alerts`, `dispatch-closing-alerts` 자체가 각각 `10:18`, `15:59` 부근에 시작하고 있었고, 기존 로직은 `scheduledFor`를 "이 시각 이후면 보내도 됨"으로만 취급해 늦게 실행돼도 그대로 발송하는 구조였다.

### Follow-up: Scheduled Alert Timing Guard / Dispatch Window Hardening

이번 후속에서는 알림을 "늦게라도 보내기"보다 "최소 5분 전 준비 + 정시 발송 시도 + 너무 늦으면 stale 처리" 쪽으로 재정의했다. 핵심은 prepare와 dispatch를 더 촘촘한 cron으로 여러 번 깨우되, 실제 메일은 목표 시각 직전까지만 기다렸다가 발송하고, 늦은 실행이나 중복 cron 이벤트는 DB idempotency와 delivery claim으로 흡수하도록 바꾸는 것이었다.

### What Changed In This Follow-up

1. `prepare-daily-alerts`의 운영 기준 시각을 `09:55 KST`, `prepare-closing-alerts`를 `15:25 KST`로 명시하고, 관리자 스케줄 상태도 이 기준에 맞춰 보이도록 조정했다.
2. Vercel cron 지연을 흡수하기 위해 `prepare-daily-alerts`, `dispatch-alerts`, `prepare-closing-alerts`, `dispatch-closing-alerts`를 여러 개의 조기 cron으로 분산 등록했다.
3. dispatch 단계는 목표 시각보다 조금 일찍 호출되면 최대 `10분`까지 대기한 뒤 `10:00` / `15:30`에 맞춰 발송하도록 바꿨다.
4. 목표 시각을 `5분` 넘긴 알림 job은 더 이상 늦게 보내지 않고 stale 경로로 빠지도록 정리했다.
5. 같은 날 이미 `READY` job이 있으면 prepare를 재실행하지 않고 재사용하고, 이미 `SENT` / `PARTIAL_FAILURE` job이 있으면 dispatch가 prepare를 다시 돌려 기존 결과를 덮어쓰지 않도록 바꿨다.
6. 중복 cron 호출이나 동시 dispatch 실행이 있어도 같은 이메일이 두 번 보내지지 않도록 `NotificationDelivery`를 `PENDING`으로 선점하는 claim 로직을 추가했다.
7. 이 새 규칙을 잠그기 위해 alert-service 테스트에 dispatch wait, late grace, persisted job reuse 테스트를 추가했고, scheduler status 테스트도 조기 prepare window를 정상으로 해석하도록 보강했다.

### Main Code Changes In This Follow-up

- 알림 스케줄 상수 / dispatch window / delivery claim
  - `src/lib/server/alert-service.ts`
  - `src/lib/server/job-shared.ts`
- 관리자 스케줄 상태 판정
  - `src/lib/server/ipo-read-service.ts`
- route max duration
  - `src/app/api/jobs/dispatch-alerts/route.ts`
  - `src/app/api/jobs/dispatch-closing-alerts/route.ts`
- cron 배치
  - `vercel.json`
- 테스트
  - `tests/alert-service.test.ts`
  - `tests/ipo-read-service.test.ts`

### Live Service Impact Assessment In This Follow-up

- 영향도: 중간, 긍정적
- 이유:
  - 실제 사용자 체감 품질 문제였던 "늦은 알림"을 직접 겨냥한 수정이다.
  - DB schema 변경이나 migration 없이 application flow와 cron 배치만 바꿨다.
  - 중복 발송 방지와 stale 차단 로직을 함께 넣어, 조기 cron을 여러 번 추가해도 메일이 중복 발송될 가능성을 낮췄다.
  - 다만 절대적인 정시 보장은 여전히 Vercel Cron 호출 품질에 의존한다. 이번 변경은 플랫폼 지연을 흡수하도록 보정한 것이지, 외부 스케줄러 수준의 hard guarantee를 추가한 것은 아니다.
  - 따라서 플랫폼 호출이 매우 늦으면 예전처럼 늦은 메일을 보내는 대신, 이번 버전은 늦은 메일을 skip/stale 처리하는 쪽으로 더 보수적으로 동작한다.

### Verification In This Follow-up

- `npm test`
  - 전체 `85개` 테스트 통과
- `npx tsc --noEmit`
  - 타입 체크 통과
- `npm run build`
  - production build 통과
- `npm run lint`
  - 기존 [src/app/ipos/[slug]/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/ipos/%5Bslug%5D/page.tsx)의 unused import warning 1건만 유지

### Current Decisions To Remember In This Follow-up

- `10시 분석 메일` 준비 기준은 `09:55 KST`, 발송 기준은 `10:00 KST`다.
- `마감 30분 전 메일` 준비 기준은 `15:25 KST`, 발송 기준은 `15:30 KST`다.
- dispatch는 목표 시각보다 조금 일찍 깨우면 기다렸다가 정시에 보내고, 목표 시각을 `5분` 넘기면 늦은 메일을 보내지 않는다.
- 조기 cron 다중 호출을 사용하므로, prepare / dispatch / delivery 단계는 모두 idempotent 하게 유지해야 한다.
- Vercel Cron은 분 단위 창 안에서 호출될 수 있으므로, 이번 구조는 정시 발송을 "보정"한 것이며 플랫폼 자체의 절대 보장을 대신하지는 않는다.

### Follow-up: Pause Closing-Soon Alerts For Hobby Operation

Vercel 공식 문서를 다시 확인한 결과 Hobby는 cron 자체를 여러 개 둘 수는 있지만 호출 정밀도가 `Hourly (±59 min)` 수준이라 `15:30` 마감 임박 알림의 체감 품질을 안정적으로 맞추기 어렵다. 그래서 이번 추가 후속에서는 기능을 완전히 지우는 대신 `마감 30분 전 알림`만 pause 처리하고, `10시 분석 메일` 경로만 운영 대상으로 남기도록 정리했다.

### What Changed In This Hobby Follow-up

1. `vercel.json`에서 `prepare-closing-alerts`, `dispatch-closing-alerts` cron 등록을 제거했다.
2. `CLOSING_SOON_ALERTS_ENABLED = false` 상수를 두고, closing-soon prepare/dispatch 함수는 호출돼도 `disabled` 로그만 남기고 no-op 반환하도록 바꿨다.
3. closing alert API route도 동일 플래그를 보고 `disabled: true` 응답으로 빠지게 정리해, stale cron/수동 호출이 있어도 실제 메일 발송으로 이어지지 않도록 했다.
4. admin 대시보드의 상태 카드와 설명 문구에서 현재 운영 기준을 `06:00 동기화 + 09:55/10:00 메일` 중심으로 정리했다.

### Live Service Impact Assessment In This Hobby Follow-up

- 영향도: 낮음~중간, 보수적
- 이유:
  - 10시 메일 경로는 유지하고 closing-soon 경로만 명시적으로 비활성화했다.
  - cron 제거와 no-op 가드를 함께 넣어 자동/수동 경로 모두에서 closing 메일이 나가지 않도록 했다.
  - 다만 Hobby에서도 `10시` 자체는 여전히 Vercel 호출 정밀도 한계의 영향을 받으므로, 이번 변경은 운영 단순화이지 정시 보장을 새로 얻는 수정은 아니다.

## 2026-04-13

### Thread Summary

이번 스레드에서는 4월 운영 로그를 기준으로 반복되던 `Transaction API error: Unable to start a transaction in the given time.` 장애를 추적했고, 실제 서비스 영향이 있는 경로를 코드와 QA까지 포함해 정리했다. 핵심은 `daily-sync`의 DB transaction fan-out을 줄이고, alert prepare/dispatch가 `daily-sync`를 중복 강제 실행하면서 장애를 증폭시키던 흐름을 완화하는 것이었다.

### Follow-up: Daily Sync Concurrency Guard / Alert Refresh Dedup

이번 후속에서는 4월 `ERROR` 169건이 사실상 하나의 transaction-start 실패 계열로 묶인다는 점을 기준으로, `daily-sync`와 alert 파이프라인의 운영 안정성을 직접 보강했다. 기능을 넓히는 작업이 아니라 기존 스케줄/알림 흐름이 같은 DB 부하를 서로 증폭시키지 않도록 보호 장치를 넣는 성격이 강하다.

### What Changed In This Follow-up

1. `runDailySync()`는 source record별 DB 반영을 더 이상 `Promise.all`로 동시에 열지 않고 순차 처리하도록 바꿨다.
2. 그 결과 source record 수만큼 interactive transaction을 한꺼번에 요청하던 구조를 제거해 Prisma transaction slot 압박을 줄였다.
3. `ensureFreshAlertSourceData()`는 이제 최근 성공 로그뿐 아니라 최근 `started` / `failed` 로그도 함께 보고 refresh 여부를 결정한다.
4. 이미 `daily-sync`가 진행 중이면 alert job은 새 강제 refresh를 시작하지 않고 일정 시간 동안 완료를 기다리도록 정리했다.
5. 방금 실패한 `daily-sync`가 있으면 alert job이 즉시 같은 강제 refresh를 다시 반복하지 않도록 cooldown을 넣었다.
6. dispatch 단계는 같은 날 이미 저장된 `READY` notification job이 있으면 prepare를 다시 돌지 않고 기존 job을 재사용하도록 바꿨다.
7. 이 새 분기들을 잠그기 위해 alert-service 테스트에 refresh decision과 dispatch reuse 관련 테스트를 추가했다.

### Main Code Changes In This Follow-up

- sync transaction pressure 완화
  - `src/lib/server/ipo-sync-service.ts`
- alert refresh dedup / READY job reuse
  - `src/lib/server/alert-service.ts`
- 테스트
  - `tests/alert-service.test.ts`

### Live Service Impact Assessment In This Follow-up

- 영향도: 중간 이상, 긍정적
- 이유:
  - 4월 운영 로그에서 반복된 실제 장애 경로를 직접 겨냥한 수정이다.
  - DB schema 변경이나 migration 없이 application flow만 조정해 배포 리스크는 비교적 낮다.
  - `daily-sync`는 더 느려질 수 있지만, 목표는 처리 속도보다 transaction start 실패를 줄여 실제 성공률을 높이는 것이다.
  - alert job은 이제 fresh sync가 없을 때도 무조건 새 강제 refresh를 때리지 않고, 진행 중/최근 실패 상태를 보고 더 보수적으로 행동한다.

### Verification In This Follow-up

- `npm run lint`
  - 기존 [src/app/ipos/[slug]/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/ipos/%5Bslug%5D/page.tsx)의 unused import warning 1건만 유지
- `npm test`
  - `82개` 테스트 모두 통과
- `npm run build`
  - production build 통과

### Current Decisions To Remember In This Follow-up

- `daily-sync` DB upsert는 transaction pressure를 줄이기 위해 의도적으로 순차 처리한다.
- alert prepare job은 fresh `daily-sync`가 없더라도, 이미 sync가 진행 중이면 기다리고 최근 실패 직후에는 즉시 재시도하지 않는다.
- dispatch job은 같은 날 이미 저장된 `READY` job이 있으면 prepare를 재실행하지 않고 재사용한다.

## 2026-04-04

### Thread Summary

이번 스레드에서는 최근에 커진 server/page 계층의 중복과 파생 상태 계산을 단계적으로 정리했다. 목표는 실서비스 동작을 바꾸지 않은 채 read eligibility, alert prepare, sync persistence, home/detail view-model, admin auth/navigation, public cache revival 규칙을 각자 한 곳으로 모아 이후 유지보수와 QA 비용을 낮추는 것이었다.

### Follow-up: Public Snapshot Regression Guard / QA

이번 후속에서는 앞서 제거한 공개 홈 운영 메타데이터 노출이 다시 돌아오지 않도록 public snapshot 조립 경로를 한 번 더 잠갔다. 핵심은 공개 홈 payload를 만드는 순간 `mode`, `generatedAt`, `calendarMonth`, `ipos`만 남기는 projection을 공통 helper로 강제하고, fallback 경로까지 같은 규칙을 타게 하는 것이었다. 기능을 바꾸는 작업이라기보다 회귀 방지 hardening 성격이 강하며, 변경 후 targeted QA로 타입/테스트/빌드를 다시 확인했다.

### What Changed In This Follow-up

1. 공개 홈 snapshot 전용 helper `toPublicHomeSnapshot()`를 추가해 admin용 넓은 객체가 섞여 들어와도 공개 필드만 남기도록 정리했다.
2. `getPublicHomeSnapshot()`은 이제 DB read 결과를 그대로 반환하지 않고, public projection helper를 거쳐 응답하도록 고정했다.
3. fallback public snapshot도 같은 helper를 사용하게 해, fallback 모드에서도 운영용 필드가 실수로 다시 붙지 않도록 맞췄다.
4. 회귀 테스트를 추가해 `recipients`, `jobs`, `operationLogs`, `schedulerStatuses`, `ipoScoreSummaries` 같은 admin telemetry가 공개 snapshot에 포함되지 않는지 잠갔다.

### Main Code Changes In This Follow-up

- 공개 홈 projection hardening
  - `src/lib/public-home-snapshot.ts`
  - `src/lib/server/ipo-read-service.ts`
  - `src/lib/fallback-data.ts`
- 테스트
  - `tests/public-home-snapshot.test.ts`

### Live Service Impact Assessment In This Follow-up

- 영향도: 매우 낮음
- 이유:
  - 공개 홈의 실제 UI/카피/캐시 TTL은 그대로고, 반환 payload를 public-only projection으로 한 번 더 정리하는 수준이다.
  - DB schema, route, cron, admin flow 변화가 없고 공개 홈 summary card의 현재 노출 정보도 바뀌지 않는다.
  - 이번 변경은 기존 보안 수정의 회귀 방지 성격이어서 서비스 동작보다 데이터 노출 경계를 더 보수적으로 만든다.

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm test -- tests/public-home-snapshot.test.ts tests/ipo-read-service.test.ts tests/page-data-revival.test.ts`
- `npm run build`

### Current Decisions To Remember In This Follow-up

- 공개 홈 snapshot은 항상 public projection을 거쳐 조립한다.
- 공개 홈에서는 admin telemetry를 직접 계산하거나 pass-through 하지 않는다.
- fallback public snapshot도 database public snapshot과 같은 노출 경계를 유지한다.

### Follow-up: Security Hardening QA / Auth Surface Tightening

이번 후속에서는 보안 리뷰에서 확인된 4가지 이슈를 실제 코드와 QA로 정리했다. 핵심은 관리자 로그인 경로의 open redirect와 brute-force 완화, 잡 API의 query-string secret 제거, 공개 홈의 운영 메타데이터 노출 축소였다. 기능을 넓히기보다 인증/노출 경계를 더 보수적으로 만드는 작업이었고, 변경 후 전체 테스트와 빌드를 다시 돌려 서비스 영향도까지 점검했다.

### What Changed In This Follow-up

1. `normalizeAdminNextPath()`는 이제 `/admin` 또는 `/admin/...` 내부 경로만 허용하고, `//evil.example` 같은 protocol-relative 값은 모두 `/admin` fallback으로 강제한다.
2. `/login` server action에는 클라이언트별 실패 누적 제한을 추가해 `10분 내 5회 실패` 시 `15분` 동안 잠그고, `retryAfter`와 함께 다시 로그인 화면으로 돌려보내도록 바꿨다.
3. 로그인 실패, rate limit 발동, 로그인 성공은 모두 `admin:login` 운영 로그로 남겨 이후 감사와 운영 확인이 가능하게 했다.
4. 잡 API 인증은 `Authorization: Bearer <CRON_SECRET>` 또는 `x-job-secret` header만 허용하고, `?secret=` query 방식은 더 이상 인증으로 인정하지 않도록 정리했다.
5. 공개 홈 `/`는 더 이상 활성 수신자 수, READY 잡 수, Database/Fallback 같은 운영용 수치를 노출하지 않고, 공개 정보인 마지막 갱신 시각 / 이벤트 수 / 시간대 위주로만 보여 주도록 바꿨다.
6. 새 동작을 잠그기 위해 login throttle, admin next path, job auth, public snapshot revive 관련 테스트를 추가하거나 보강했다.

### Main Code Changes In This Follow-up

- 로그인 보안
  - `src/app/login/actions.ts`
  - `src/app/login/page.tsx`
  - `src/lib/admin-navigation.ts`
  - `src/lib/admin-login-throttle.ts`
- 잡 인증
  - `src/lib/job-auth.ts`
- 공개 홈 운영 메타데이터 비노출
  - `src/lib/server/ipo-read-service.ts`
  - `src/app/page.tsx`
  - `src/lib/types.ts`
  - `src/lib/fallback-data.ts`
- 테스트
  - `tests/admin-navigation.test.ts`
  - `tests/admin-login-throttle.test.ts`
  - `tests/job-auth.test.ts`
  - `tests/page-data-revival.test.ts`

### Live Service Impact Assessment In This Follow-up

- 영향도: 낮음
- 이유:
  - DB schema 변경이나 migration이 없고, 공개/관리자 주요 route 구조도 유지된다.
  - Vercel Cron의 공식 호출 방식인 `Authorization: Bearer <CRON_SECRET>`는 그대로 지원하므로 자동 스케줄 실행에는 영향이 없다.
  - 공개 홈 변경은 운영용 숫자를 공개용 숫자로 바꾼 수준이라 사용자 여정이나 캐시 TTL(`revalidate = 300`)은 바뀌지 않는다.
  - 관리자 정상 로그인 흐름은 그대로지만, 잘못된 비밀번호를 짧은 시간에 반복 입력하면 잠시 재시도가 제한된다.
  - 유일한 운영 주의점은 `?secret=`로 수동 호출하던 외부 스크립트가 있다면 이제 `x-job-secret` header로 바꿔야 한다는 점이다.
- 확인 결과:
  - 전체 테스트 `78개`가 모두 통과했다.
  - `npx tsc --noEmit`, `npm run build` 모두 통과했다.
  - `npm run lint`는 기존 [src/app/ipos/[slug]/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/ipos/[slug]/page.tsx)의 unused import warning 1건만 남았고, 이번 보안 변경으로 새 lint error는 없었다.

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- `npm run lint`

### Current Decisions To Remember In This Follow-up

- 관리자 로그인 `next` 경로는 admin 내부 경로만 허용한다.
- 잡 API 수동 호출은 앞으로 query-string secret이 아니라 `x-job-secret` header를 기준으로 한다.
- 현재 로그인 throttle은 프로세스 메모리 기반이라 다중 인스턴스 전역 공유는 아니다. 전역 rate limit이 필요해지면 KV/DB-backed limiter로 확장한다.
- 공개 홈은 운영 메타데이터를 보여주지 않고 공개 일정 정보만 노출한다.

### What Changed In This Follow-up

1. `ipo-read-service`에서 `analysis >= 1` 그리고 `sourceSnapshot >= 1`일 때만 read model로 노출하는 eligibility 판단을 공통 helper로 통합했다.
2. `alert-service`의 일일 알림 준비와 마감 임박 알림 준비가 같은 파이프라인을 공유하도록 정리해 job id, idempotency key, scheduled time 계산 규칙을 한 곳에 모았다.
3. `ipo-sync-service`의 종목 단위 DB 반영을 transaction 안으로 묶고, persisted source record 조립 / write payload 조립 / event row 생성 로직을 pure helper로 분리했다.
4. `recipient-service`는 관리자 수신자 bootstrap, primary email repair, verified email channel 해석 규칙을 helper와 transaction 경계로 정리했다.
5. 홈 `/`의 캘린더/종목 개요 파생 상태를 `buildHomeContentViewModel()`로 모아 count와 hidden count, section collapse 계산이 JSX 밖에서 한 번만 일어나도록 바꿨다.
6. 상세 `/ipos/[slug]`도 score/status/quick facts/listing facts 조립을 `page-helpers`로 빼서 렌더와 계산 책임을 분리했다.
7. 관리자 로그인 redirect, `next` 경로 정규화, `/admin` 경로 revalidate를 `admin-navigation` / `admin-surface` helper로 통합했다.
8. `page-data`의 public snapshot revive 규칙은 `page-data-revival`로 분리해 캐시 wrapper와 날짜/score fallback 복원 로직을 분리했다.

### Main Code Changes In This Follow-up

- read / alert / sync / recipient service 정리
  - `src/lib/server/ipo-read-service.ts`
  - `src/lib/server/alert-service.ts`
  - `src/lib/server/ipo-sync-service.ts`
  - `src/lib/server/recipient-service.ts`
- admin path / auth / cache revival helper 추가
  - `src/lib/admin-navigation.ts`
  - `src/lib/server/admin-surface.ts`
  - `src/lib/page-data-revival.ts`
- 홈 / 상세 / 관리자 UI 계산 정리
  - `src/app/home-content.tsx`
  - `src/app/home-content-helpers.ts`
  - `src/app/ipos/[slug]/page.tsx`
  - `src/app/ipos/[slug]/page-helpers.ts`
  - `src/app/admin/actions.ts`
  - `src/app/admin/page.tsx`
  - `src/app/admin/recipients/actions.ts`
  - `src/app/admin/recipients/page.tsx`
  - `src/app/login/actions.ts`
  - `src/app/login/page.tsx`
  - `src/lib/page-data.ts`
- 테스트
  - `tests/ipo-read-service.test.ts`
  - `tests/alert-service.test.ts`
  - `tests/ipo-sync-service.test.ts`
  - `tests/recipient-service.test.ts`
  - `tests/home-content-helpers.test.ts`
  - `tests/admin-navigation.test.ts`
  - `tests/ipo-detail-page-helpers.test.ts`
  - `tests/page-data-revival.test.ts`

### Live Service Impact Assessment

- 영향도: 낮음
- 이유:
  - 이번 변경은 정책 변경보다 규칙 공통화와 helper 분리에 집중했고, 공개/관리자 surface의 URL, 캐시 TTL, DB schema, cron schedule, mail payload 정책은 그대로 유지했다.
  - `ipo-read-service` eligibility는 기존과 같은 `analysis + sourceSnapshot` 기준을 그대로 유지해 public detail `404`, 홈 목록 제외, admin dashboard 제외 정책이 달라지지 않는다.
  - `alert-service`는 prepare 흐름을 공유했지만 alert variant별 schedule 시각과 idempotency suffix는 기존 의미를 유지한다.
  - `ipo-sync-service`는 transaction 경계가 생겨 부분 반영 위험이 줄었고, transaction 밖에 둔 scoring hook / read-back도 기존 호출 순서를 유지한다.
  - `admin` 경로 정리는 로그인 redirect와 `/admin` revalidate 규칙을 중앙화한 수준이라 운영 경로 자체는 바뀌지 않는다.
  - `page-data-revival` 분리는 cached payload를 복원하는 위치만 바꿨고, 홈 `revalidate = 300`과 detail 캐시 태그 규칙은 유지했다.
- 확인 결과:
  - `next build`가 `/`, `/admin`, `/admin/recipients`, `/ipos/[slug]`, `/login` 전부 정상 생성했다.
  - 추가된 pure helper 테스트들이 기존 런타임 포맷과 fallback copy를 잠가 줘, 구조 리팩토링으로 인한 미묘한 drift 가능성도 낮다.

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm test -- tests/page-data-revival.test.ts tests/ipo-detail-page-helpers.test.ts tests/admin-navigation.test.ts tests/recipient-service.test.ts tests/alert-service.test.ts tests/ipo-read-service.test.ts tests/ipo-sync-service.test.ts tests/home-content-helpers.test.ts`
- `npm run build`

### Current Decisions To Remember In This Follow-up

- 구조 리팩토링은 끝냈지만 public 정책은 바꾸지 않았다.
- `ipo-read-service`의 readable guard는 여전히 `analysis`와 `sourceSnapshot`이 모두 있어야 한다.
- `admin-navigation` / `admin-surface`는 운영 경로 문자열과 인증 redirect 규칙의 기준점으로 유지한다.
- `page-data-revival`은 cached public payload의 날짜/score fallback 복원 기준점으로 유지한다.

## 2026-04-01

### Follow-up: Scheduler Status QA / Nearest Run Selection

이번 스레드에서는 최근 로그 상세화 작업 뒤 QA를 진행하면서, `/admin` 스케줄 상태 카드가 같은 잡의 같은 날 재실행이 여러 번 있을 때 가장 최근 성공 로그를 대표 실행으로 잡을 수 있다는 점을 정리했다. 이 경우 실제 예정 시각 직후에 정상 실행된 잡이 있어도, 더 늦은 수동 재실행 때문에 지연 시간이 과장돼 보일 수 있다. 그래서 스케줄 상태는 이제 `예정 시각 임계값 이후 가장 먼저 성공/실패한 실행`을 기준으로 판정하고, 최근 성공 시각은 별도로 유지하도록 보정했다.

### What Changed In This Follow-up

1. 스케줄 상태 판정에서 `completed` / `failed` 로그는 같은 날 여러 건이 있어도 예정 시각 임계값 이후 가장 이른 실행을 대표로 선택하도록 바꿨다.
2. 덕분에 수동 재실행이나 중복 크론 실행이 뒤에 붙어도, 카드의 `정상/지연/실패` 판단과 지연 분 계산은 원래 예정 런에 더 가깝게 유지된다.
3. helper 테스트를 추가해 `10:22 성공 후 10:58 재실행` 같은 케이스에서 카드가 10:22를 대표 성공으로 읽는지 잠갔다.
4. 운영 문서에도 스케줄 상태 카드가 여러 실행 중 예정 시각에 가장 가까운 실행을 기준으로 본다는 점을 반영했다.

### Main Code Changes In This Follow-up

- 스케줄 상태 판정 보정
  - `src/lib/server/ipo-read-service.ts`
- 테스트
  - `tests/ipo-read-service.test.ts`
- 문서
  - `issue.md`
  - `docs/context/runtime-and-ops.md`

### Follow-up: Alert Log Specificity / Zero-Send Reason Visibility

이번 스레드에서는 `10시 분석 메일 발송` 스케줄이 관리자 화면에서 `정상`으로 보이는데 실제 수신함에는 메일이 없는 상황을 운영 로그와 DB 기준으로 확인했다. 원인은 2026-04-01 KST 기준 발송 대상 공모주가 없어 `prepare-daily-alerts`와 `dispatch-alerts`가 모두 `0건`으로 정상 종료된 것이었는데, 기존 로그는 `성공` 여부만 보여 주고 왜 `0건`이었는지 설명이 부족했다. 그래서 알림 준비 단계와 발송 단계 모두에서 후보 수, 스팩 제외 수, 발송 보류 수, 실제 dispatch 대상 수를 더 구체적으로 기록하고, 관리자 화면에서도 그 컨텍스트를 읽기 쉽게 보이도록 정리한다.

### What Changed In This Follow-up

1. `prepare-daily-alerts` / `prepare-closing-alerts`에서 당일 마감 종목 수, 스팩 제외 수, 발송 보류 수, 준비 완료 수를 요약하는 상세 로그를 남기도록 정리했다.
2. 당일 마감 종목이 아예 없을 때는 기존의 단순 `0건 준비` 대신 `대상 종목 없음` 맥락이 드러나는 로그를 남기도록 바꿨다.
3. `dispatch-alerts` / `dispatch-closing-alerts`에서도 실제 전송 직전의 due job 수, dispatchable job 수, stale job 수, 수신자/이메일 채널 수를 별도 요약 로그로 남기도록 했다.
4. 발송 완료 로그는 `0건 발송`일 때 실제 메일이 없었다는 뜻이 바로 읽히는 문구로 바꿨다.
5. 관리자 스케줄 상태 카드가 최근 완료/실패 로그 메시지를 함께 보여 주도록 바꿔 `정상 실행`과 `실제 발송 여부`를 같이 읽을 수 있게 했다.
6. 관리자 운영 로그 패널의 JSON context는 줄바꿈된 pretty-print 형태로 보여 주도록 정리했다.
7. 운영 문서에도 새 로그 액션과 해석 기준을 반영했다.

### Main Code Changes In This Follow-up

- 알림 준비/발송 상세 로그 helper
  - `src/lib/server/alert-service.ts`
  - `src/lib/server/job-shared.ts`
- 관리자 스케줄 상태 / 운영 로그 표시
  - `src/lib/server/ipo-read-service.ts`
  - `src/app/admin-log-panel.tsx`
- 테스트
  - `tests/alert-service.test.ts`
- 문서
  - `issue.md`
  - `docs/context/runtime-and-ops.md`

### Follow-up: Potential Visible Count Rule

이번 스레드에서는 홈 화면 숫자 버튼의 기준을 한 번 더 조정했다. 직전 QA 후속에서는 캘린더와 종목 개요의 숫자를 `현재 화면에 실제로 보이는 수` 기준으로 맞췄지만, 사용자가 원한 기준은 `현재 화면 문맥에서 보일 수 있는 수`에 더 가까웠다. 그래서 이제는 검색어, 선택한 필터, 캘린더 표시 범위 같은 현재 문맥은 반영하되, `지난 종목` 접힘이나 모바일 `더 보기`처럼 UI가 잠깐 접어둔 항목은 다시 숫자에 포함하도록 정리했다.

### What Changed In This Follow-up

1. 캘린더 `청약/환불/상장` 숫자는 현재 달력 그리드 범위 안에서 잡히는 고유 종목 수를 기준으로 유지하되, 해당 칩 자신의 on/off 상태와는 독립적인 잠재 표시 수로 다시 맞췄다.
2. 캘린더 `스팩 포함` 숫자는 현재 이벤트 필터와 달력 범위는 반영하지만, `스팩 포함` 토글 자체로 숨겨진 스팩도 다시 포함한 잠재 표시 수 기준으로 조정했다.
3. 캘린더 상단 `개 이벤트` 배지는 현재 필터와 표시 범위 기준의 실제 visible event count를 계속 유지했다.
4. 종목 개요의 상태 칩과 `스팩 포함` 숫자는 검색어, 스팩 포함 여부, 현재 선택된 상태 필터는 반영하되, 모바일 `더 보기` 제한이나 `지난 종목` 접힘으로 가려진 카드도 포함한 잠재 표시 수 기준으로 바꿨다.
5. helper 테스트를 visible count와 potential visible count 두 기준으로 나눠 보강해, 이후 숫자 해석이 다시 섞이지 않도록 잠갔다.

### Main Code Changes In This Follow-up

- potential visible count helper / 카운트 기준 재정리
  - `src/app/home-content-helpers.ts`
- 홈 캘린더 / 종목 개요 숫자 UI 기준 변경
  - `src/app/home-content.tsx`
- 테스트
  - `tests/home-content-helpers.test.ts`
- 문서
  - `docs/context/product-surface.md`
  - `issue.md`

### Verification In This Follow-up

- `npm test -- tests/home-content-helpers.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## 2026-03-31

### Follow-up: Visible Count Alignment After QA Review

이번 스레드에서는 캘린더 스팩 토글을 붙인 뒤 QA와 코드리뷰를 진행하면서, 홈 화면의 여러 숫자 버튼이 사용자가 실제로 보고 있는 종목 수와 어긋날 수 있다는 점을 추가로 정리했다. 특히 캘린더 `청약/환불/상장/스팩 포함` 숫자는 전체 이벤트나 화면 밖 일정까지 섞일 수 있었고, 종목 개요 필터 숫자도 모바일 축약이나 접힌 `지난 종목`을 포함한 잠재 개수에 가까웠다. 그래서 홈 화면의 클릭 가능한 카운트는 모두 `현재 화면에 실제로 보이는 종목 수` 기준으로 맞췄다.

### What Changed In This Follow-up

1. 캘린더 필터 칩 숫자를 전체 이벤트 수 대신 현재 렌더 중인 달력 그리드 안의 고유 종목 수 기준으로 바꿨다.
2. 캘린더 `스팩 포함` 숫자도 화면 밖 다음 일정이 아니라, 현재 필터 상태와 표시 범위 안에서 실제로 보이는 스팩 종목 수만 세도록 정리했다.
3. 캘린더 상단 `개 이벤트` 배지도 현재 표시 범위와 필터 상태를 반영한 visible event count 기준으로 유지되게 맞췄다.
4. 종목 개요의 상태 칩과 `스팩 포함` 숫자 역시 검색/필터/모바일 축약/접힘 상태 이후 실제로 보이는 카드 수 기준으로 바꿨다.
5. helper 테스트에 visible day range, filter-off, include-spac 조합을 추가해 숫자 기준 회귀를 잠갔다.

### Main Code Changes In This Follow-up

- visible count helper / 캘린더 카운트 기준 정리
  - `src/app/home-content-helpers.ts`
- 홈 캘린더 / 종목 개요 숫자 UI 정리
  - `src/app/home-content.tsx`
- 테스트
  - `tests/home-content-helpers.test.ts`
- 문서
  - `docs/context/product-surface.md`
  - `issue.md`

### Verification In This Follow-up

- `npm test -- tests/home-content-helpers.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

### Follow-up: Calendar SPAC Toggle

이번 스레드에서는 홈 `캘린더`에도 스팩 표시 토글을 추가했다. 기존에는 `종목 개요`에서만 `스팩 포함` 체크로 스팩을 다시 보이게 할 수 있었고, 캘린더 쪽은 이벤트 타입(`청약/환불/상장`)만 켜고 끄는 구조였다. 이제 캘린더도 같은 기준으로 스팩 이벤트를 기본 숨김으로 두고, 필요할 때만 체크박스로 다시 보이게 맞췄다. 기존 캘린더 필터 `localStorage` 값은 그대로 읽히도록 호환성을 유지했다.

### What Changed In This Follow-up

1. 캘린더 필터 저장 포맷을 확장해 event type 체크 상태와 `스팩 포함` 상태를 함께 저장하도록 바꿨다.
2. 기존 사용자 브라우저에 남아 있는 legacy 캘린더 필터 값도 계속 복원되도록 backward-compatible validator를 추가했다.
3. 캘린더 이벤트 렌더 전에 스팩 판별 helper를 적용해, 토글이 꺼져 있으면 스팩 이벤트를 숨기도록 정리했다.
4. 캘린더 이벤트 count와 스팩 count 계산을 helper로 분리하고, 관련 테스트를 추가했다.
5. 제품 문서에도 캘린더 스팩 토글 동작을 반영했다.

### Main Code Changes In This Follow-up

- 캘린더 helper / 필터 복원
  - `src/app/home-content-helpers.ts`
- 홈 캘린더 UI
  - `src/app/home-content.tsx`
- 테스트
  - `tests/home-content-helpers.test.ts`
- 문서
  - `docs/context/product-surface.md`
  - `issue.md`

### Verification In This Follow-up

- `npm test -- tests/home-content-helpers.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## 2026-03-29

### Follow-up: Backend Service Layer Refactor / Jobs Facade Split

이번 스레드에서는 기능이 몰려 있던 `src/lib/jobs.ts`를 얇은 호환 facade로 줄이고, 실제 서버 로직을 `src/lib/server/` 아래 service 단위로 분리했다. 목표는 외부 동작을 바꾸지 않은 채 sync, read, alert, recipient, mapper 책임을 나눠 다음 기능 추가와 운영 디버깅을 쉽게 만드는 것이었다. 함께 pure helper 테스트도 보강했고, 이후 코드 리뷰에서 public detail 경로의 legacy snapshot 없는 행이 stricter guard로 `404`될 수 있는 follow-up risk 하나를 확인했다.

### What Changed In This Follow-up

1. `src/lib/jobs.ts`를 export facade로 바꾸고, 기존 import 경로는 유지했다.
2. sync/read/alert/recipient/shared mapper 책임을 `src/lib/server/*`로 분리했다.
3. snapshot payload parsing과 public/detail/dashboard mapper 중복을 `src/lib/server/ipo-mappers.ts`로 모았다.
4. 알림 로직은 prepare/dispatch/render 단계를 같은 서비스 내부에서 나눠 읽기 쉽게 정리했다.
5. pure logic 중심 테스트로 mapper/alert helper를 잠갔다.
6. 코드 리뷰에서 `getPublicIpoBySlug()`가 source snapshot 없는 legacy row를 `null` 처리할 수 있는 회귀 위험을 확인했다.

### Main Code Changes In This Follow-up

- facade / server services
  - `src/lib/jobs.ts`
  - `src/lib/server/job-shared.ts`
  - `src/lib/server/ipo-sync-service.ts`
  - `src/lib/server/ipo-read-service.ts`
  - `src/lib/server/alert-service.ts`
  - `src/lib/server/recipient-service.ts`
  - `src/lib/server/ipo-mappers.ts`
- 테스트
  - `tests/alert-service.test.ts`
  - `tests/ipo-mappers.test.ts`
- 문서
  - `issue.md`
  - `AGENTS.md`
  - `docs/context/project-overview.md`
  - `docs/context/runtime-and-ops.md`
  - `docs/context/score-rollout-status.md`
  - `docs/ipo-score-architecture.md`

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm test`
- `npm run lint`

### Issues / Notes In This Follow-up

- 코드 리뷰에서 `src/lib/server/ipo-read-service.ts`의 public detail guard가 `sourceSnapshots.length === 0`인 legacy row를 `404`로 만들 수 있다는 `P2` follow-up을 확인했다.
- mapper 자체는 snapshot이 없어도 optional chaining으로 동작하므로, 후속 작업에서는 guard 제거 또는 snapshot backfill 중 하나를 정해야 한다.
- 이번 리팩토링은 구조 분리가 목적이었고, 외부 route, action 이름, Prisma schema, cache 동작, score pause 정책은 바꾸지 않았다.

## 2026-03-28

### Follow-up: Exclude SPAC From Alert Emails

이번 스레드에서는 홈 화면에서만 기본 숨김 처리되던 스팩을 메일 알림 파이프라인에서도 제외했다. 기존에는 당일 마감 종목이면 스팩도 일반 공모주와 같은 기준으로 10시 분석 메일과 마감 30분 전 리마인더 준비 대상에 들어갔는데, 이제는 종목명 패턴 기준으로 스팩을 먼저 걸러 자동 알림 후보에서 제외한다. 이 기준이 홈 화면 토글과 어긋나지 않도록 스팩 판별 로직도 공용 helper로 합쳤다.

### What Changed In This Follow-up

1. 스팩 판별 정규식을 공용 helper로 분리해 홈 화면과 알림 준비 경로가 같은 기준을 쓰게 했다.
2. `prepareDailyAlerts`, `prepareClosingSoonAlerts`에서 오늘 마감 종목 중 스팩은 후보 생성 전에 제외되도록 바꿨다.
3. 스팩 제외 건수와 종목명은 운영 로그에 남겨, 왜 메일이 준비되지 않았는지 `/admin`과 로그에서 바로 확인할 수 있게 했다.
4. 스팩 제외 helper 테스트를 추가하고, 기존 홈 helper 테스트도 공용 판별 기준 위에서 계속 동작하도록 유지했다.
5. 운영/제품 문서와 루트 README에 `스팩은 자동 메일 대상에서 제외` 정책을 반영했다.

### Main Code Changes In This Follow-up

- 스팩 판별 / 알림 제외 helper
  - `src/lib/ipo-classification.ts`
- 알림 준비 / 운영 로그
  - `src/lib/jobs.ts`
- 홈 화면 helper 연결
  - `src/app/home-content-helpers.ts`
- 테스트
  - `tests/ipo-classification.test.ts`
  - `tests/home-content-helpers.test.ts`
- 문서
  - `issue.md`
  - `README.md`
  - `docs/context/product-surface.md`
  - `docs/context/runtime-and-ops.md`

### Verification In This Follow-up

- `npm test -- tests/ipo-classification.test.ts tests/home-content-helpers.test.ts`
- `npx tsc --noEmit`
- `npm test`
- `npm run lint`
- `npm run build`

### Issues / Notes In This Follow-up

- 새 이슈는 확인되지 않았다.
- 자동 메일 제외 기준은 종목명 패턴 기반이므로, 스팩 명칭이 일반 종목처럼 들어오는 예외 데이터가 생기면 패턴을 보강해야 한다.
- `/admin` 운영 로그에서는 `skipped_spac_ipos` 액션으로 스팩 제외 건수를 확인할 수 있다.

### Follow-up: Home Tracked IPO Search / Segmentation / Optional SPAC Toggle

이번 스레드에서는 홈 `종목 개요`가 종목 수 증가에 따라 단순 세로 카드 리스트만으로는 훑기와 찾기가 모두 불편해지는 문제를 먼저 손봤다. 그래서 검색과 상태 칩, 정렬을 한 번에 추가하고, 리스트를 `이번 주 마감 / 그다음 일정 / 지난 종목`으로 다시 나눴다. 지난 종목은 기본 접힘으로 두고, 모바일에서는 일부만 먼저 노출한 뒤 `더 보기`로 확장되게 정리했다. 추가로 스팩은 기본적으로 숨기고, 필터 줄 맨 뒤 `스팩 포함` 체크 토글을 켰을 때만 함께 보이도록 바꿨다.

### What Changed In This Follow-up

1. 홈 `종목 개요` 상단에 `종목명 / 주관사 / 시장` 검색 입력과 정렬 select를 추가했다.
2. `전체 / 이번주 마감 / 이번달 / 청약중 / 지난 종목` 칩을 추가하고, 헤더 배지는 `필터 결과 / 전체` 개수로 바꿨다.
3. 카드 리스트를 `이번 주 마감`, `그다음 일정`, `지난 종목` 섹션으로 구분했고, `지난 종목`은 기본 접힘으로 바꿨다.
4. 모바일과 태블릿 폭에서는 섹션별 초기 카드 수를 제한하고 `더 보기`로 확장되게 정리했다.
5. 스팩은 종목명 패턴(`스팩`, `기업인수목적`, `SPAC`) 기준으로 판별해 기본 숨김으로 두고, 필터 줄 맨 뒤 `스팩 포함` 체크 토글을 켰을 때만 노출되게 했다.
6. 필터/정렬/섹션 분리와 스팩 판별 규칙은 별도 helper로 분리하고, 관련 테스트를 추가했다.

### Main Code Changes In This Follow-up

- 홈 종목 개요 탐색 UI
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
  - `src/app/page.tsx`
- 탐색 helper / 테스트
  - `src/app/home-content-helpers.ts`
  - `tests/home-content-helpers.test.ts`
- 문서
  - `issue.md`
  - `docs/context/product-surface.md`

### Verification In This Follow-up

- `npm test -- tests/home-content-helpers.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

### Current Decisions To Remember In This Follow-up

- 홈 `종목 개요`는 이제 단순 세로 리스트가 아니라 검색, 상태 칩, 정렬, 섹션 그룹 흐름으로 탐색한다.
- `지난 종목`은 기본 접힘이며, 과거 종목만 남는 경우에는 자동으로 펼쳐 보인다.
- 스팩은 기본적으로 숨김이고, 필터 줄 맨 뒤 `스팩 포함` 체크를 켰을 때만 함께 보인다.
- 좁은 폭에서는 필터 줄 전체가 한 줄 가로 스크롤을 유지한다.

### Follow-up: Mobile Viewport Normalization / Responsive Polish

이번 스레드에서는 실제 휴대폰에서 화면이 모바일처럼 재배치되지 않던 원인을 먼저 바로잡았다. 핵심 문제는 루트 viewport를 `width=1024`로 고정해 둔 탓에 `900px`, `420px` 이하 반응형 분기가 실제 모바일에서 제대로 동작하지 않던 점이었다. 그래서 viewport를 `device-width`로 되돌리고, 공용 스타일에 초소형 폰(`480px`) 대응 레이어를 추가한 뒤, 홈/상세/admin/login의 2열 압축 레이아웃과 버튼/칩/배지 밀도를 함께 조정했다.

### What Changed In This Follow-up

1. 루트 viewport를 `device-width`로 바꾸고, 공용 스타일 토큰에 `phone(<=480px)` breakpoint를 추가했다.
2. 공용 버튼, pill, 타이포, page shell 여백을 모바일과 초소형 폰 기준으로 두 단계 조정했다.
3. 홈 `/`에서는 모바일에서 캘린더를 계속 숨기되, 기존 `일정 바로 보기` CTA가 숨겨진 캘린더를 가리키지 않도록 `종목 개요 보기` anchor로 대체했다.
4. 홈 종목 카드와 broker chip은 좁은 폭에서 긴 한글 텍스트가 잘리지 않도록 wrapping과 spacing을 보강했다.
5. 상세 `/ipos/[slug]`의 quick facts, 체크 포인트, 일정/상세 데이터가 실제 폰 폭에서 세로 흐름으로 자연스럽게 읽히도록 density를 정리했다.
6. `/admin`, `/admin/recipients`, `/login`도 같은 기준으로 hero/grid 붕괴 시점과 badge/action 정렬을 정리해 모바일 압축 레이아웃을 줄였다.
7. 제품 문서에도 모바일 홈 정책과 viewport/device-width 기준을 짧게 반영했다.

### Main Code Changes In This Follow-up

- viewport / 공용 반응형 토큰
  - `src/app/layout.tsx`
  - `src/styles/_tokens.scss`
  - `src/styles/_mixins.scss`
  - `src/styles/common.scss`
- 공개 화면
  - `src/app/page.tsx`
  - `src/app/page.module.scss`
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
  - `src/app/ipos/[slug]/page.module.scss`
  - `src/components/broker-chip.module.scss`
- admin / login
  - `src/app/admin/page.module.scss`
  - `src/app/admin/recipients/page.module.scss`
  - `src/app/login/page.module.scss`
- 문서
  - `issue.md`
  - `docs/context/product-surface.md`

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Playwright iPhone 13 확인
  - 홈 `/`
  - 상세 `/ipos/아이엠바이오로직스`
  - `/login`

### Current Decisions To Remember In This Follow-up

- 루트 viewport는 이제 `device-width`가 기준이다.
- 모바일 홈에서는 캘린더를 계속 숨기고, 상단 secondary CTA는 `종목 개요 보기`로 연결한다.
- 공용 breakpoint는 기존 `1024/900` 체계를 유지하되, 초소형 폰용 `480px` 레이어를 추가해 density만 더 줄인다.
- 점수 UI는 계속 숨김 상태로 유지한다.

## 2026-03-26

### Follow-up: Public Score Pause / Hidden UI / Reopen Notes

이번 스레드에서는 공개 점수 노출을 다시 닫아두기로 결정했다. 점수 자체는 내부 휴리스틱과 팩트 테이블 구조를 유지하되, 사람마다 받아들이는 해석 편차가 크고 현재 소스 커버리지도 아직 고르지 않다고 봤다. 그래서 점수 파이프라인은 나중에 다시 열기 쉽도록 자리만 남기고, 현재 공개 화면과 메일에서는 다시 공시 기반 체크 포인트 중심으로 돌아가게 정리했다. 이 상태가 다음 작업자와 AI에게 바로 전달되도록, 닫아둔 이유와 재오픈 절차를 별도 문서로 분리해 남긴다.

### What Changed In This Follow-up

1. `src/lib/jobs.ts`에서 점수 fact sync / 재계산 helper를 no-op으로 바꾸고, 원래 호출 코드는 주석으로 남겨 추후 재오픈 시 바로 복구할 수 있게 했다.
2. 공개 홈, 상세, 메일 read path에서는 더 이상 `getPublicIpoScoreMap()`을 붙이지 않고 `publicScore = null` 상태로 동작하게 정리했다.
3. 메일/리마인더 문구도 점수/추천형 태그를 제거하고, 다시 공시 기반 체크 포인트 중심의 중립 문구로 돌렸다.
4. 홈 카드의 점수 상태 배지/종합점수, 상세 히어로의 점수 pill/점수 카드/산출 근거, admin의 `V2 점수 상태` 카드까지 DOM은 유지하되 `display: none`으로 가려 재오픈 시 CSS 클래스만 걷어도 다시 보일 수 있게 했다.
5. 현재 공개 정책과 재오픈 체크리스트를 `docs/context/score-rollout-status.md`로 분리했고, `AGENTS.md`, `README.md`, `docs/context/*`, `docs/ipo-score-architecture.md`를 최신 상태로 동기화했다.
6. 이후 홈 카드에서 점수 UI가 계속 노출되는 것을 확인했고, 원인은 `.scoreHidden`보다 뒤에서 선언된 `.ipoScoreBadge`, `.ipoStats div`, `.scoreCard`의 `display` 규칙이 우선한 CSS specificity 충돌이었다. 세 화면의 `scoreHidden`을 `display: none !important`로 보강해 실제 렌더에서도 확실히 숨겨지게 수정했다.

### Main Code Changes In This Follow-up

- 점수 노출 중단 / 메일 문구 정리
  - `src/lib/jobs.ts`
- 홈 / 상세 점수 UI 숨김
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
  - `src/app/ipos/[slug]/page.tsx`
  - `src/app/ipos/[slug]/page.module.scss`
- 문서
  - `issue.md`
  - `AGENTS.md`
  - `README.md`
  - `docs/README.md`
  - `docs/context/README.md`
  - `docs/context/project-overview.md`
  - `docs/context/runtime-and-ops.md`
  - `docs/context/data-and-scoring.md`
  - `docs/context/product-surface.md`
  - `docs/context/score-rollout-status.md`
  - `docs/ipo-score-architecture.md`

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`

### Current Decisions To Remember In This Follow-up

- 공개 홈, 상세, 메일에서는 정량 점수를 다시 숨긴 상태가 현재 기준이다.
- 점수 데이터 구조와 admin score summary fetch는 남겨두되, 현재는 admin UI까지 포함해 점수 관련 화면을 전부 숨긴 상태다.
- 홈/상세 점수 DOM은 유지하고 있으므로, 재오픈 시에는 `jobs.ts` helper 복구 + `scoreHidden` 제거가 핵심 복구 포인트다.
- 재오픈 전에는 추가 소스 커버리지, 점수 해석 기준, 공개 문구 정책을 다시 점검한다.

### Follow-up: Documentation Restructure For AI Context

이번 스레드에서는 길게 누적된 `README.md`, `AGENTS.md`, `issue.md`의 역할이 서로 섞이기 시작한 문제를 정리했다. 목표는 사람과 AI 작업자가 모두 같은 구조로 프로젝트 맥락을 빠르게 복원하는 것이었고, 이를 위해 `docs/README.md`를 문서 인덱스로 두고 `docs/context/` 아래에 역할별 맥락 문서를 분리했다. 동시에 `AGENTS.md`는 짧은 운영 규칙과 읽을 문서 링크만 남기는 식으로 압축하고, `README.md`는 사용자/운영자용 quick start 중심으로 되돌렸다.

### What Changed In This Follow-up

1. 문서 인덱스 역할의 `docs/README.md`를 추가했다.
2. `docs/context/` 아래에 프로젝트 개요, 런타임/운영, 데이터/점수, 제품/UI 문서를 분리했다.
3. `AGENTS.md`는 중복 설명을 줄이고, 반드시 알아야 할 운영 규칙과 문서 읽기 순서만 남기는 형태로 재정리했다.
4. `README.md`는 사용자/운영자용 quick start와 핵심 명령 위주로 축약하고, 자세한 프로젝트 맥락은 `docs/`로 넘겼다.
5. `agent.md`는 canonical 문서를 가리키는 얇은 안내 파일로 유지해 중복 문맥이 다시 벌어지지 않게 했다.

### Main Code Changes In This Follow-up

- 문서 인덱스 / context 분리
  - `docs/README.md`
  - `docs/context/README.md`
  - `docs/context/project-overview.md`
  - `docs/context/runtime-and-ops.md`
  - `docs/context/data-and-scoring.md`
  - `docs/context/product-surface.md`
- 안내 문서 정리
  - `AGENTS.md`
  - `README.md`
  - `agent.md`
  - `issue.md`

### Current Decisions To Remember In This Follow-up

- `issue.md`는 계속 스레드별 변경 로그로만 쓴다.
- AI/작업자 빠른 진입점은 `AGENTS.md -> docs/context/README.md -> 필요한 세부 문서` 순서다.
- `README.md`는 설치/실행/운영 quick start 중심으로 유지하고, 긴 설계/운영 맥락은 `docs/`에 둔다.
- 같은 내용을 여러 md 파일에 반복 복붙하지 않고, 기준 문서에 링크하는 방식으로 유지한다.

### Follow-up: Public Score Exposure / Runtime Guard / Review Notes

이번 스레드에서는 내부에서만 보이던 종목 점수를 공개 홈과 상세 화면까지 노출했다. `ipo_score_snapshot`의 최신 결과를 public read path에 연결해 홈 카드와 상세 히어로에 `종합점수`, `유통`, `확약`, `경쟁`, `마켓` 점수를 직접 보여주도록 바꿨고, 메일/리마인더 문구도 같은 점수 스냅샷을 쓰도록 정리했다. 구현 뒤에는 코드리뷰를 다시 진행했고, `prisma.ipoMaster` delegate가 없을 때 홈이 런타임 에러로 죽던 문제는 fail-soft guard로 막았다.

### What Changed In This Follow-up

1. `PublicIpoScoreRecord`를 추가하고 `getPublicHomeSnapshot()`, `getPublicIpoBySlug()`에서 `ipo_master -> latest ipo_score_snapshot`을 읽어 public read model에 병합했다.
2. 홈 `종목 개요` 카드에서 기존 `정량 점수 비공개` 문구를 제거하고 `종합점수`와 점수 상태 배지를 직접 표시하도록 바꿨다.
3. 상세 페이지 히어로 카드에서 `종합점수`, `유통`, `확약`, `경쟁`, `마켓`, `재무 보정`을 한 번에 확인할 수 있게 바꿨다.
4. 상세의 `공시 기반 체크 포인트`는 이제 legacy analysis 문구보다 public score snapshot의 `explanations`, `warnings`를 우선 사용하게 했다.
5. closing-day 메일과 closing-soon 리마인더도 더 이상 `정량 점수 비공개`라고 쓰지 않고, 공개 화면과 같은 점수/설명 데이터를 쓰도록 정리했다.
6. 런타임에서 `prisma.ipoMaster.findMany`가 `undefined`로 터지는 경우를 위해 scoring store에 delegate 존재 여부 확인 가드를 넣어 홈/상세가 크래시하지 않고 `UNAVAILABLE`로 fail-soft 되게 했다.
7. 점수 미표시 원인을 점검한 결과, 최신 DB 스냅샷은 `READY 10 / PARTIAL 6`이었고 `NOT_READY`는 없었다. 따라서 현재 보이는 `산출대기`는 대개 데이터 미산출보다 public score read가 fail-soft로 `null`이 된 경우일 가능성이 높다.

### Main Code Changes In This Follow-up

- public score read model / runtime guard
  - `src/lib/types.ts`
  - `src/lib/ipo-score-store.ts`
  - `src/lib/jobs.ts`
  - `src/lib/page-data.ts`
- public UI
  - `src/app/page.tsx`
  - `src/app/home-content.tsx`
  - `src/app/home-content.module.scss`
  - `src/app/ipos/[slug]/page.tsx`
  - `src/app/ipos/[slug]/page.module.scss`
- 문서
  - `issue.md`
  - `docs/ipo-score-architecture.md`

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm test`
  - `36` tests passed
- `npm run lint`
- `npm run build`
- 실DB score snapshot 확인
  - latest summary: `READY 10 / PARTIAL 6`
  - `NOT_READY 0`
  - 예시: `메쥬 75.8`, `아이엠바이오로직스 72.9`, `카나프테라퓨틱스 72.4`, `한패스 70.9`
  - `PARTIAL` 예시: `채비 62.0`, `에스팀 71.2`, `코스모로보틱스 61.0`

### Current Decisions To Remember In This Follow-up

- 공개 화면은 이제 `publicScore.totalScore`가 있으면 바로 노출한다.
- `PARTIAL`도 총점이 있으면 공개한다. 이 경우 일부 서브점수는 `데이터 미확보`로 남을 수 있다.
- 현재 `산출대기`는 두 경우를 뜻한다.
  - 실제 점수 스냅샷이 없는 경우
  - scoring read가 fail-soft로 `publicScore = null`이 된 경우
- 실DB 기준 최신 상태에는 `NOT_READY`가 없으므로, 개발 환경에서 `산출대기`가 많이 보이면 데이터 부족보다 runtime scoring read 문제를 먼저 의심한다.
- 남아 있는 리뷰 finding 3건은 모두 `P2`이며, 커밋 전 즉시 차단할 치명 이슈로 보지는 않는다.
  - public cache invalidation 미연동으로 최대 `5분` stale 가능
  - scoring availability가 일시 실패 후 프로세스 생애 동안 latch-off 될 수 있음
  - broad TypeError matching이 다른 scoring bug를 숨길 수 있음

### Follow-up: Broker Notice Completion / V2.4 Competition Scoring / Live Review Fixes

이번 스레드에서는 남아 있던 브로커 단계까지 마저 진행했다. `삼성증권`, `하나증권` 공식 수수료 가이드를 같은 registry에 추가했고, `대신증권` 모바일 공지 보드와 첨부 PDF를 읽어 종목별 `총경쟁률`, `일반배정물량`, `균등`, `비례` 데이터를 `ipo_subscription`에 적재하도록 확장했다. 동시에 경쟁점수는 `v2.4`로 올려 새 배정물량 팩트를 실제 경쟁 분석 증거로 반영하게 했고, 구현 후 라이브 동기화에서 드러난 `하나증권 수수료 fallback` 버그까지 같은 턴에 바로 수정했다.

### What Changed In This Follow-up

1. 브로커 웹 수집 범위를 `한국투자증권`, `신한투자증권`, `KB증권`, `미래에셋증권`에서 더 확장해 `삼성증권`, `하나증권` 공식 수수료 가이드도 같은 수집 레지스트리로 편입했다.
2. `대신증권` 공지 보드 `DM_Basic_List.aspx?boardseq=114&m=3817`를 읽어 종목명 기준으로 현재 공지 엔트리를 찾고, 상세 페이지 `DM_Basic_Read.aspx?seq=...`에서 HTML 본문과 첨부 PDF URL을 함께 수집하도록 구현했다.
3. 새 PDF 추출을 위해 `pdfjs-dist`를 추가했고, Node 서버에서 PDF 텍스트만 뽑아 `총경쟁률`, `일반배정물량`, `균등배정`, `비례배정` 값을 정규식으로 읽도록 했다.
4. `SourceBrokerSubscriptionDetail` 경로에 대신 공지 기반 `generalCompetitionRate`, `allocatedShares`, `equalAllocatedShares`, `proportionalAllocatedShares`를 실제로 채우게 했다.
5. 경쟁점수는 `v2.4`로 상향해 기존 `경쟁률/최소주수/최고한도/증거금률/수수료/온라인전용` 입력에 더해 `일반청약 배정물량`, `균등 배정물량`도 evidence와 소폭 가중치로 반영하게 했다.
6. 라이브 셀프 리뷰에서 `하나증권` HTML fallback이 오프라인/온라인 행 숫자를 한 문자열로 합쳐 비정상적으로 큰 수수료를 만들던 문제를 발견했고, 온라인 row만 좁게 캡처하는 방식으로 즉시 수정했다.
7. 같은 수정 이후 `daily-sync --force-refresh`를 다시 돌려 `하나증권 / 채비 / subscriptionFee=2000`이 실제 DB 최신 row로 반영되는 것까지 확인했다.

### Main Code Changes In This Follow-up

- 브로커 가이드 / 종목별 공지 / PDF 수집
  - `src/lib/sources/broker-subscription.ts`
  - `package.json`
  - `package-lock.json`
- 점수 엔진 / 버전 상향
  - `src/lib/scoring/types.ts`
  - `src/lib/scoring/v2.ts`
  - `src/lib/ipo-score-store.ts`
- 테스트
  - `tests/broker-subscription.test.ts`
  - `tests/ipo-scoring.test.ts`
- 문서
  - `issue.md`
  - `docs/ipo-score-architecture.md`

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm test`
  - `36` tests passed
- `npm run lint`
- `npm run build`
- `npm run job:daily-sync -- --force-refresh`
  - 브로커 공지/PDF 추가 직후: `queued=19`, `processed=19`, `createdSnapshots=19`, `failed=0`
  - 하나 fallback 수정 후 재실행: `queued=1`, `processed=1`, `createdSnapshots=1`, `failed=0`
- 실DB 확인
  - `한패스 / 대신증권 / generalCompetitionRate=1411.14 / allocated=55,000 / equal=27,500 / proportional=27,500`
  - `케이뱅크 / 삼성증권 / subscriptionFee=0`
  - `채비 / 하나증권 / subscriptionFee=2000`
  - 최신 `v2.4` 스냅샷 분포: `READY 10 / PARTIAL 6`
  - 상위 점수 예시: `메쥬 75.8`, `아이엠바이오로직스 72.9`, `카나프테라퓨틱스 72.4`, `한패스 70.9`

### Current Decisions To Remember In This Follow-up

- 브로커 웹 확장은 이제 `공통 가이드 registry + 브로커별 종목 공지 resolver + PDF 보강` 3층 구조로 유지한다.
- `대신증권`처럼 종목별 공지 소스가 있는 브로커는 generic guide보다 issue notice 값을 우선 fact source로 본다.
- PDF는 브라우저 렌더링 HTML이 아니라 서버에서 텍스트 추출 후 필요한 수치만 정규식으로 해석한다.
- `allocatedShares`, `equalAllocatedShares`, `proportionalAllocatedShares`는 단순 보조 메모가 아니라 `competitionScore v2.4` 입력 증거로 계속 유지한다.
- 브로커 HTML fallback은 넓은 블록 전체가 아니라 실제 row 범위를 좁게 잡아야 한다. 그렇지 않으면 여러 fee 숫자가 한 문자열로 붙어 비정상 값이 생길 수 있다.

### Follow-up: Broker Guide Expansion / V2.3 Competition Scoring / Self Review Fixes

이번 스레드에서는 브로커 웹 수집을 다음 단계로 확장해 `KB증권`, `미래에셋증권` 공식 가이드를 `ipo_subscription` 보강 경로에 추가했다. 동시에 브로커 표기 정규화와 `EUC-KR` 문자셋 디코딩을 정리해 실수집 안정성을 높였고, 경쟁점수도 `v2.3`으로 올려 `온라인 전용 청약 제한`을 반영하게 했다. 구현 뒤에는 바로 셀프 리뷰를 진행했고, 실제 동기화에서 드러난 `미래에셋 수수료 누락`과 `한투 카탈로그 fetch fail-soft 회귀`를 즉시 수정했다.

### What Changed In This Follow-up

1. 브로커 수집 모듈을 registry 형태로 확장해 `한국투자증권`, `신한투자증권`, `KB증권`, `미래에셋증권` 공식 가이드를 같은 흐름으로 읽도록 정리했다.
2. `fetchText()`를 header/meta charset 기반 디코딩으로 바꿔 `EUC-KR` 공식 페이지도 런타임 fetch에서 안정적으로 파싱되게 했다.
3. `KB증권` 가이드에서 `온라인 청약 수수료 1,500원`과 `일반 고객 온라인 전용 제한`을 수집해 `ipo_subscription.subscription_fee`, `has_online_only_condition`에 반영했다.
4. `미래에셋증권` 가이드에서 `온라인 청약 수수료 2,000원`과 `미배정 시 수수료 면제` 안내를 읽어 브로커 메모에 반영했다.
5. 브로커명 정규화에 `케이비증권 -> kb증권`, `엔에이치투자증권 -> nh투자증권` 같은 canonical alias를 추가해 한글 표기와 영문 브랜드 표기가 같은 브로커로 합쳐지게 했다.
6. 경쟁점수는 `v2.3`으로 상향해 기존 `경쟁률/최소주수/최고한도/증거금률/수수료`에 더해 `온라인 전용 제한 증권사 수`를 감점 신호로 반영했다.
7. 셀프 리뷰에서 `미래에셋` 통합 수수료표 안에서 첫 `온라인` 행을 잘못 잡아 수수료가 `null`로 들어가던 문제를 재현했고, `공모주 청약(일반)` 섹션 범위로 파서를 좁혀 수정했다.
8. 같은 리뷰에서 `한투 청약종목안내` fetch를 `Promise.all`로 바꾸며 부분 실패 허용이 깨졌던 회귀를 발견했고, 다시 fail-soft 구조로 되돌렸다.

### Main Code Changes In This Follow-up

- 브로커 정규화 / 가이드 수집
  - `src/lib/broker-brand.ts`
  - `src/lib/sources/broker-subscription.ts`
- 점수 엔진 / 버전 상향
  - `src/lib/scoring/types.ts`
  - `src/lib/scoring/v2.ts`
  - `src/lib/ipo-score-store.ts`
- 테스트
  - `tests/broker-subscription.test.ts`
  - `tests/ipo-scoring.test.ts`
- 문서
  - `issue.md`
  - `docs/ipo-score-architecture.md`

### Verification In This Follow-up

- `npx tsc --noEmit`
- `npm test`
  - `30` tests passed
- `npm run lint`
- `npm run build`
- `npm run job:daily-sync -- --force-refresh`
  - 첫 실행: `v2.3` 기준 `queued=19`, `processed=19`, `createdSnapshots=19`, `failed=0`
  - 수정 후 재실행: `queued=1`, `processed=1`, `createdSnapshots=1`, `failed=0`
- 실DB 확인
  - `미래에셋증권 / 액스비스 / subscriptionFee=2000`
  - `케이비증권 / 리센스메디컬 / subscriptionFee=1500 / hasOnlineOnlyCondition=true`
  - `케이비증권 / 채비 / subscriptionFee=1500 / hasOnlineOnlyCondition=true`
  - 최신 `v2.3` 스냅샷 분포: `READY 10 / PARTIAL 6`

### Current Decisions To Remember In This Follow-up

- 브로커 웹 수집은 단일 parser if/else로 키우지 않고 registry 기반으로 계속 확장한다.
- 브로커 HTML은 `UTF-8` 가정 금지, charset-aware decode를 유지한다.
- 브로커명은 저장 label과 별개로 canonical normalize key를 사용해 source merge / dedupe / scoring join을 안정화한다.
- `has_online_only_condition`은 단순 메모가 아니라 경쟁점수 입력으로 계속 유지한다.
- 현재 브로커 웹이 안정적으로 채우는 값은 `수수료`, `온라인 전용 여부`, `최고청약한도(한투)` 중심이고, `균등/비례 배정 수량`은 종목별 공지 소스가 더 필요하다.

## 2026-03-25

### Follow-up: Admin Recipient Email Management / Direct Delivery Test

관리자 전용 수신자 관리 페이지를 추가해, `admin-recipient` 아래의 이메일 채널을 화면에서 직접 등록/수정/삭제할 수 있게 했다. 동시에 발송 로직도 primary 1개만 보던 방식에서 verified 이메일 채널 전체를 순회하도록 바꿔, 관리자 화면에서 추가한 주소가 실제 `dispatch-*` 발송 대상에 포함되게 맞췄다.

### What Changed In This Follow-up

1. `/admin`에서 바로 이동할 수 있는 `/admin/recipients` 관리자 전용 페이지를 새로 만들고, 등록된 발송 이메일 목록 조회 / 새 이메일 등록 / 인라인 수정 / 삭제를 지원하도록 구현했다.
2. 수신자 저장 방식은 새 `Recipient`를 늘리는 대신 기존 `admin-recipient` 1개 아래에 여러 `RecipientChannel(EMAIL)`을 두는 구조로 유지해, 기존 delivery idempotency와 발송 파이프라인을 그대로 활용했다.
3. 관리자 화면에서 등록한 이메일은 verified 상태로 즉시 저장되며, 마지막 남은 발송 이메일은 삭제되지 않도록 막았다.
4. 기존 `ensureAdminRecipient()`의 “`ADMIN_EMAIL`만 남기고 다른 이메일은 삭제” 동작을 제거하고, `ADMIN_EMAIL`은 초기 seed 역할만 하도록 바꿨다.
5. `resolveRecipients()`는 verified primary 1개만 고르지 않고 verified 이메일 채널 전체를 발송 대상으로 포함하도록 수정했다.
6. `prepare-daily-alerts`, `prepare-closing-alerts`는 verified 이메일이 하나도 없으면 `/admin/recipients`에서 먼저 등록하라는 명확한 에러로 fail-closed 하도록 정리했다.
7. 실제 운영 확인을 위해 추가 등록한 두 번째 이메일 채널로 직접 SMTP 테스트 메일을 발송했고, provider 응답 기준 `accepted`를 확인했다.

### Main Code Changes In This Follow-up

- 관리자 수신자 관리 UI / 액션
  - `src/app/admin/page.tsx`
  - `src/app/admin/recipients/page.tsx`
  - `src/app/admin/recipients/page.module.scss`
  - `src/app/admin/recipients/actions.ts`
- 관리자 수신자 bootstrap / 발송 대상 해석
  - `src/lib/jobs.ts`
- 문서
  - `issue.md`
  - `README.md`

### Verification In This Follow-up

- `npm run build`
- `npm run lint`
  - 기존 `src/lib/sources/opendart-prospectus.ts` unused helper warning 3건만 유지, 새 lint error는 없음
- 직접 SMTP 테스트
  - `admin-recipient`의 최근 추가 이메일 채널을 대상으로 테스트 메일 발송
  - provider 응답에서 `accepted` 확인, `rejected` 없음

### Current Decisions To Remember In This Follow-up

- 현재 수신자 관리 UI는 “여러 Recipient”가 아니라 “단일 `admin-recipient` + 여러 verified EMAIL 채널” 모델이다.
- 실제 `dispatch-alerts` / `dispatch-closing-alerts`는 verified 이메일 채널 전체로 발송한다.
- `ADMIN_EMAIL`은 더 이상 유일한 발송 대상이 아니라 초기 seed / preview 성격으로 본다.
- 발송 이메일이 0개가 되지 않도록 마지막 채널 삭제는 막는다.

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
