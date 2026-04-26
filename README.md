# IPO Calendar Alerts

공모주 일정을 자동 수집하고, 청약 마감 당일 오전 10시에 분석 메일을 보내는 개인용 풀스택 서비스입니다.

이 프로젝트는 단순 캘린더가 아니라, 외부 금융 데이터를 수집해 사용자에게 필요한 일정과 판단 포인트를 보여주고, 운영자는 관리자 화면에서 데이터 동기화와 메일 발송 상태를 추적할 수 있도록 만든 서비스입니다.

## Project Summary

- 공모주 청약 일정, 환불일, 상장일을 캘린더와 카드 UI로 제공
- 공시 기반 핵심 정보를 공개 홈/상세 페이지에서 확인
- 청약 마감 당일 오전 10시 분석 메일 발송
- 관리자 화면에서 동기화, 운영 로그, 발송 상태, 수신자 관리
- 외부 데이터가 비거나 깨지는 상황을 고려한 validation, fallback, 운영 로그 설계
- AI 프롬프트 기반 개발 workflow로 문제 정의, 구현, 리팩토링, 테스트, 문서화를 반복

## Stack

### Frontend

- Next.js 16 App Router
- React 19
- TypeScript
- SCSS Module
- Responsive layout

### Backend

- Next.js Route Handlers
- Server Actions
- Prisma ORM
- PostgreSQL
- Neon
- Vercel Cron
- Nodemailer + Gmail SMTP

### Data Sources

- OpenDART
- KIND
- SEIBro
- Broker web data

### Quality And Operations

- Node.js 24
- ESLint
- TypeScript type check
- Node test runner + `tsx`
- Secret redaction
- Job API authentication
- Operation logs
- Idempotent notification pipeline

## Frontend Features

### Public Home

- 월간 공모주 캘린더
- 종목 개요 카드
- 검색, 상태 필터, 정렬
- 스팩 기본 숨김 및 선택적 노출
- 모바일에서는 캘린더보다 종목 개요를 우선 노출
- 공개 화면에는 운영용 metadata가 노출되지 않도록 public projection 사용

### IPO Detail

- 확정 공모가, 최소청약금액, 환불일, 상장예정일, 유통가능물량, 주관사 표시
- 공시 기반 체크 포인트 제공
- source metadata와 admin-only 정보는 공개 화면에서 숨김

### Admin

- 관리자 로그인
- 운영 로그 확인
- daily sync 수동 실행
- 알림 발송 상태 확인
- 수신자 이메일 채널 관리
- 좁은 화면에서도 운영 정보가 깨지지 않도록 responsive UI 구성

현재 UI 방향은 `Calm IPO Desk`입니다. 과한 장식보다 금융 업무 화면에 가까운 차분한 정보 밀도, 낮은 radius, 읽기 쉬운 카드와 표면을 우선합니다.

## Backend Features

### Data Sync

- 외부 source fetch
- 공모주 데이터 normalize
- DB upsert
- stale record 처리
- source snapshot 저장
- invalid source record skip-mode
- source별 fetch retry/timeout helper

### Notification Pipeline

- 청약 마감 당일 오전 분석 메일 준비
- Vercel Cron 기반 prepare/dispatch 분리
- 같은 날 이미 준비된 job 재사용
- 이미 발송된 job 재준비 방지
- 늦게 실행된 dispatch의 stale 처리
- delivery claim으로 중복 발송 방지
- 종목명 기준 스팩 자동 제외
- 필수값 누락 시 자동 발송 차단

### Admin And Security

- 관리자 로그인 세션
- 로그인 rate limit
- job API secret 인증
- 운영 로그 저장
- secret/password/token/API key redaction
- public read path와 admin read path 분리

## Project Character

이 프로젝트는 일반적인 CRUD 서비스보다 운영 성격이 강합니다.

- 외부 데이터 품질이 일정하지 않음
- 날짜와 시간대가 사용자 경험에 직접 영향을 줌
- 알림은 중복 발송되면 안 됨
- 공개 화면과 관리자 데이터 경계를 지켜야 함
- 점수/추천 정보는 신뢰도와 표현 책임이 큼
- 운영자는 왜 메일이 보내졌는지, 왜 보내지지 않았는지 추적할 수 있어야 함

따라서 핵심 개발 방향은 기능 추가보다 `데이터 신뢰도`, `idempotency`, `공개/관리자 경계`, `운영 로그`, `장애 추적 가능성`을 함께 챙기는 것입니다.

## AI-Assisted Development

이 프로젝트는 AI 프롬프트를 중심으로 개발을 진행하고 있습니다.

AI는 단순 코드 생성 도구가 아니라, 페어 프로그래밍 파트너와 리뷰어처럼 사용합니다. 사용자가 해결하려는 문제와 운영 조건을 제시하고, AI가 코드 구현, 리팩토링, 테스트 보강, 문서 정리, 리스크 점검을 함께 수행하는 방식입니다.

### Prompting Style

작업 요청은 가능한 한 기능명보다 목표/문제 단위로 정의합니다.

예시:

```text
이번 목표는 10시 분석 메일의 운영 신뢰도를 높이는 것이다.

성공 기준:
- 이미 READY job이 있으면 재사용한다.
- 이미 SENT된 날에는 다시 prepare하지 않는다.
- 늦게 실행된 dispatch는 stale 처리한다.
- admin 로그에서 왜 보냈는지/왜 안 보냈는지 확인 가능해야 한다.

제약:
- 중복 발송 가능성이 생기면 안 된다.
- 공개 화면에는 운영 metadata를 노출하지 않는다.
```

### Problem-Solving Approach

1. 사용자가 해결하려는 운영/제품 문제를 제시
2. AI가 관련 문서와 코드를 먼저 읽고 현재 구조 파악
3. 목표, 성공 기준, 깨면 안 되는 조건, 검증 방법을 정리
4. 구현 또는 문서 변경
5. 테스트, 타입 체크, lint, build, smoke test 중 필요한 검증 수행
6. `issue.md`와 `docs/context/`에 변경 이유와 후속 결정을 기록

AI가 빠뜨릴 수 있는 전제는 다음 기준으로 다시 확인합니다.

- 공개 화면에 노출해도 되는 데이터인가
- 관리자/운영 전용 정보가 섞이지 않는가
- job이나 알림이 중복 실행되어도 안전한가
- 시간대와 기준 날짜가 명확한가
- 외부 데이터가 비거나 틀릴 때 어떻게 실패하는가
- 기존 pause/rollout 상태를 유지해야 하는가
- DB migration, cron, env 변경이 필요한가

## Portfolio Notes

이 프로젝트에서 강조할 수 있는 경험은 다음과 같습니다.

- Next.js App Router 기반 풀스택 서비스 설계
- 공개 페이지, 관리자 페이지, 서버 액션, route handler를 함께 구성
- Prisma/PostgreSQL 기반 데이터 모델링
- 외부 데이터 수집과 정규화
- Vercel Cron 기반 scheduled job 설계
- 메일 알림 pipeline과 중복 발송 방지
- 공개/관리자 데이터 경계 분리
- 운영 로그와 장애 추적 가능성 확보
- AI-assisted development workflow를 활용한 반복 구현과 검증

## Quick Start

세부 운영 규칙과 스케줄 정책은 [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)를 기준으로 봅니다.

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
- 공개 read path와 알림 idempotency 규칙은 [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)에 유지
- UI/제품 노출 정책은 [product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)에 유지

## Document Map

- 작업자/AI 진입점: [`AGENTS.md`](/Users/shs/Desktop/Study/ipo/AGENTS.md)
- 사람용 문서 지도: [`docs/README.md`](/Users/shs/Desktop/Study/ipo/docs/README.md)
- AI 작업자용 읽기 순서: [`docs/context/README.md`](/Users/shs/Desktop/Study/ipo/docs/context/README.md)
- 프로젝트 개요: [`docs/context/project-overview.md`](/Users/shs/Desktop/Study/ipo/docs/context/project-overview.md)
- 런타임/운영: [`docs/context/runtime-and-ops.md`](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- 데이터/점수: [`docs/context/data-and-scoring.md`](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- 제품/UI: [`docs/context/product-surface.md`](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
- AI 개발 회고: [`docs/context/ai-development-reflection.md`](/Users/shs/Desktop/Study/ipo/docs/context/ai-development-reflection.md)
- 점수 설계 상세: [`docs/ipo-score-architecture.md`](/Users/shs/Desktop/Study/ipo/docs/ipo-score-architecture.md)
- 스레드 로그: [`issue.md`](/Users/shs/Desktop/Study/ipo/issue.md)

## Current Product Status

- 공개 홈과 상세는 현재 점수형 UI를 숨기고 공시 기반 체크 포인트 중심으로 노출
- 현재 UI 방향은 `Calm IPO Desk`로, 과한 장식보다 차분한 금융 업무 화면과 정보 가독성을 우선
- 모바일/좁은 화면 기준은 `1024px`이며, 이 구간에서는 캘린더를 숨기고 종목 개요를 우선 노출
- 점수 시스템 코드는 유지하지만, 공개 rollout은 pause 상태
- 점수 데이터 구조는 남겨두지만, 현재는 admin UI까지 포함해 점수 관련 화면을 숨겨 둠
- 점수 재오픈 기준과 복구 포인트는 [`docs/context/score-rollout-status.md`](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)를 기준으로 봄

## Environment Variables

주요 변수는 아래입니다. 상세 설명과 운영상 주의점은 [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)를 기준으로 봅니다.

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
