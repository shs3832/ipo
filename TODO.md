# Implementation TODO

이 문서는 앞으로 구현할 후보를 `issue.md` 변경 로그와 분리해 관리하기 위한 얇은 backlog다.

- `issue.md`: 스레드별 작업 기록
- `docs/context/*`: 운영, 제품, 점수, 데이터 정책의 기준 문서
- `TODO.md`: 다음 구현 후보의 상태와 판단 근거

## Status Rule

- `Active`: 다음 구현 후보로 검토할 가치가 높음
- `Parked`: 지금은 구현하지 않지만, 조건이 바뀌면 다시 열 수 있음
- `Done enough`: 별도 TODO로 관리할 필요가 낮음

## Active

### 1. Admin Data Quality Board Production Rollout Check

관리자 데이터 품질 보드는 로컬 production build와 브라우저 QA까지 통과했지만, 실제 배포 환경의 외부 source·운영 DB·cache를 변경하는 강제 동기화는 아직 실행하지 않았다.

성공 기준:

- 배포 후 비로그인 `/admin`이 로그인 화면으로 이동하고 로그인 후 품질 요약/목록이 정상 렌더링됨
- 관리자 품질 건수와 종목별 누락 사유가 같은 시점의 dashboard snapshot과 일치함
- 자동 cron과 겹치지 않는 시간에 수동 강제 동기화를 1회 실행하고 성공/실패 feedback을 확인함
- `admin:daily-sync`의 `requested` / `completed`와 `job:daily-sync`의 `started` / `completed` 로그가 한 흐름으로 남음
- 동기화 후 공개 홈/상세 cache가 갱신되며 source metadata는 공개 화면에 노출되지 않음
- Vercel function duration, DB timeout/transaction error, OpenDART/KIND/SEIBro 오류가 새로 증가하지 않음
- cron과 수동 실행의 겹침이 관찰되면 distributed lock 또는 재실행 cooldown을 별도 설계하고, 관찰 전에는 불필요한 상태를 추가하지 않음

주요 진입점:

- [src/app/admin/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/admin/page.tsx)
- [src/app/admin/actions.ts](/Users/shs/Desktop/Study/ipo/src/app/admin/actions.ts)
- [src/lib/admin-ipo-quality.ts](/Users/shs/Desktop/Study/ipo/src/lib/admin-ipo-quality.ts)
- [src/lib/server/ipo-sync-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-sync-service.ts)
- [docs/context/runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)

검증:

- production `/admin` browser smoke
- 수동 동기화 전후 품질 건수와 `sourceFetchedAt` 비교
- `OperationLog`와 Vercel function log 확인
- 공개 홈/상세 cache 갱신과 admin metadata 미노출 확인

### 2. Public Score Rollout Reopen Review

현재 공개 홈, 상세, 메일의 정량 점수 노출은 pause 상태다.
점수 계산기와 DB 구조는 유지하지만, 사용자에게 다시 보여주려면 신뢰도와 표현 책임을 먼저 확인해야 한다.

성공 기준:

- source coverage가 종목별로 충분한지 확인
- 점수 설명 문구가 과도한 추천처럼 읽히지 않도록 조정
- public read path에 score snapshot을 다시 붙여도 cache/fail-soft 동작이 안전함
- 홈, 상세, 메일, admin UI의 점수 노출 정책이 일관됨
- 문서 동기화 완료

주요 진입점:

- [docs/context/score-rollout-status.md](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)
- [docs/context/data-and-scoring.md](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- [src/lib/server/ipo-sync-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-sync-service.ts)
- [src/lib/server/ipo-read-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-read-service.ts)
- [src/lib/server/alert-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/alert-service.ts)

검증:

- targeted score/read tests
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- public home/detail/admin/mail smoke

### 3. Calendar Weekend Column Reopen Decision

현재 데스크톱 캘린더는 청약 일정과 무관한 주말 열을 숨기는 것이 기본값이다.
사용자가 월간 일정 맥락을 더 자연스럽게 보길 원하면 주말 열 복구를 검토한다.

성공 기준:

- 데스크톱에서 월간 달력 구조가 더 자연스러운지 확인
- 모바일에서는 기존처럼 종목 개요 우선 정책 유지
- 스팩 포함, 필터 count, localStorage 필터 동작 유지
- `Calm IPO Desk` 톤과 정보 밀도 유지

주요 진입점:

- [docs/context/product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
- [src/app/home-content.tsx](/Users/shs/Desktop/Study/ipo/src/app/home-content.tsx)
- [src/app/home-content.module.scss](/Users/shs/Desktop/Study/ipo/src/app/home-content.module.scss)
- [src/app/home-content-helpers.ts](/Users/shs/Desktop/Study/ipo/src/app/home-content-helpers.ts)

검증:

- home helper tests
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- desktop/mobile browser visual QA

## Parked

### 4. Closing-Soon Alert Reopen

마감 30분 전 알림은 현재 pause 상태를 유지한다.
지금 운영 목표에서는 10시 closing-day analysis 메일이 더 중요하고, Hobby cron의 정시 보장 한계도 있어 즉시 재오픈 대상으로 두지 않는다.

다시 열 조건:

- `CLOSING_SOON_ALERTS_ENABLED` 재활성화 필요성이 명확함
- `vercel.json` cron 복구까지 포함한 운영 계획이 있음
- stale 처리, idempotency, 인증 순서, 중복 발송 방지 QA를 다시 수행할 수 있음

기준 문서:

- [docs/context/runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- [src/lib/server/alert-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/alert-service.ts)
- [src/lib/server/job-shared.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/job-shared.ts)
- [vercel.json](/Users/shs/Desktop/Study/ipo/vercel.json)

### 5. Major Dependency Upgrade

현재는 major upgrade를 진행하지 않는다.
Next와 React는 이미 최신 major 라인이고, Prisma 7 / TypeScript 6 / ESLint 10은 제품 기능보다 마이그레이션 리스크가 더 크다.

다시 열 조건:

- 보안 advisory나 플랫폼 요구로 major upgrade가 필요함
- Prisma 7 migration spike를 별도 브랜치에서 검증할 시간이 있음
- generation path, adapter, ESM, typecheck, build 영향까지 한 번에 검증할 수 있음

검토 메모:

- Prisma 7은 `prisma-client-js`에서 새 client generator와 adapter 구조로 넘어가는 작업이어서 단순 package bump가 아니다.
- TypeScript 6과 ESLint 10은 런타임 기능보다 tooling migration에 가깝다.

### 6. DB Migration For Structural Expansion

현재는 DB migration을 새로 만들지 않는다.
Recipient, RecipientChannel, Subscription, NotificationJob, NotificationDelivery 구조가 이미 있어 알림 확장은 기존 스키마로 먼저 실험할 수 있다.

다시 열 조건:

- public multi-recipient UI나 사용자 로그인 구조를 실제로 열기로 결정함
- Telegram 실제 발송에서 metadata JSON만으로는 검증/상태 관리가 부족함
- 알림 개인화 조건이 `Subscription.scope` JSON으로 감당하기 어려울 만큼 복잡해짐
- 점수 V3에서 새 fact table이나 정규화된 source table이 필요함

기준 문서:

- [docs/context/product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
- [docs/context/data-and-scoring.md](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- [prisma/schema.prisma](/Users/shs/Desktop/Study/ipo/prisma/schema.prisma)

## Done Enough

### 7. README / Portfolio Explanation

README 기준으로는 충분히 정리된 상태다.
프로젝트 성격, 기술 스택, 운영 안정성, AI-assisted development workflow, portfolio notes가 이미 루트 README에 반영돼 있다.

남은 선택 작업:

- 면접 Q&A 전용 `docs/context/interview-notes.md` 작성
- 주요 기술 결정별 `상황`, `선택`, `이유`, `대안`, `결과`, `아쉬운 점`, `근거 파일` 정리

기준 문서:

- [README.md](/Users/shs/Desktop/Study/ipo/README.md)
- [docs/context/ai-development-reflection.md](/Users/shs/Desktop/Study/ipo/docs/context/ai-development-reflection.md)
