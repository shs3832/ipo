# IPO Calendar Alerts

공모주 일정을 자동 수집하고, 청약 마감 당일 오전 10시에 분석 메일을 보내는 개인용 서비스입니다.

현재 제품의 중심 축은 다음 3가지입니다.

- 캘린더에서 공모주 일정 확인
- 공개 홈/상세에서 공시 기반 체크 포인트 확인
- 관리자 화면에서 운영 로그와 발송 상태 관리

## Stack

- Next.js 16 App Router
- React 19
- Prisma + PostgreSQL
- Neon
- Vercel + Cron
- Nodemailer + Gmail SMTP
- OpenDART / KIND / SEIBro / 브로커 웹 수집

## Quick Start

```bash
source ~/.nvm/nvm.sh && nvm use
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

## Common Commands

```bash
npm run dev
npm test
npm run lint
npm run build
npm run prisma:generate
npm run job:daily-sync
npm run job:score-recalc
npm run mail:sample
```

## Required Runtime Notes

- Node 버전은 `v24.14.0`
- 날짜/스케줄 판단은 항상 `Asia/Seoul`
- 홈 `/`는 `5분` 캐시를 사용
- 공개 read path는 DB write를 하지 않음
- 자동 알림은 종목명 기준 스팩(`기업인수목적`, `스팩`, `SPAC`)을 제외함
- 자동 알림은 `offerPrice`, `refundDate`, `leadManager`가 없으면 차단됨

## Document Map

- 작업자/AI 진입점: [`AGENTS.md`](/Users/shs/Desktop/Study/ipo/AGENTS.md)
- 문서 인덱스: [`docs/README.md`](/Users/shs/Desktop/Study/ipo/docs/README.md)
- 프로젝트 개요: [`docs/context/project-overview.md`](/Users/shs/Desktop/Study/ipo/docs/context/project-overview.md)
- 런타임/운영: [`docs/context/runtime-and-ops.md`](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- 데이터/점수: [`docs/context/data-and-scoring.md`](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- 제품/UI: [`docs/context/product-surface.md`](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
- 점수 설계 상세: [`docs/ipo-score-architecture.md`](/Users/shs/Desktop/Study/ipo/docs/ipo-score-architecture.md)
- 스레드 로그: [`issue.md`](/Users/shs/Desktop/Study/ipo/issue.md)

## Current Product Status

- 공개 홈과 상세는 현재 점수형 UI를 숨기고 공시 기반 체크 포인트 중심으로 노출
- 점수 시스템 코드는 유지하지만, 공개 rollout은 pause 상태
- 점수 데이터 구조는 남겨두지만, 현재는 admin UI까지 포함해 점수 관련 화면을 숨겨 둠
- 점수 재오픈 기준과 복구 포인트는 [`docs/context/score-rollout-status.md`](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)를 기준으로 봄

## Environment Variables

주요 변수는 아래입니다.

- `DATABASE_URL`
- `ADMIN_ACCESS_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `ADMIN_EMAIL`
- `CRON_SECRET`
- `JOB_SECRET`
- `APP_BASE_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `IPO_SOURCE_URL`
- `OPENDART_API_KEY`
- `SEIBRO_SERVICE_KEY`

세부 운영 메모는 [`docs/context/runtime-and-ops.md`](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)를 참고합니다.
