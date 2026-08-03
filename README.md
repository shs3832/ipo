# IPO Calendar Alerts

공모주 일정을 자동 수집하고, 청약 마감 당일 오전 10시에 이메일 또는 앱푸시로 분석 알림을 보내는 개인용 풀스택 서비스입니다.

이 프로젝트의 중심은 `AI로 어디까지 구현할 수 있는가`를 시험하는 데 있지 않습니다. 외부 금융 데이터가 불완전하고 알림 운영에 실패 가능성이 있는 실제 서비스에서, 사용자가 AI와 함께 문제를 정의하고 근거를 확인해 무엇을 보여주고·숨기고·고칠지 판단하는 과정을 다룹니다.

사용자는 제품 목표, 우선순위, 공개 범위와 최종 판단을 맡고, AI는 코드와 문서 탐색, 대안 제시, 작은 구현, 테스트와 회귀 위험 점검을 가속합니다. 결과는 프롬프트나 생성 코드량이 아니라 실제 데이터, 운영 로그, 브라우저와 테스트 근거로 검증합니다.

## Project Summary

- 공모주 청약 일정, 환불일, 상장일을 캘린더와 카드 UI로 제공
- 공시 기반 핵심 정보를 공개 홈/상세 페이지에서 확인하고, 미확보 보조 정보는 숨김
- 청약 마감 당일 오전 10시 분석 알림 발송
- 이메일 / 앱푸시 채널별 수신 설정
- 관리자 화면에서 종목별 데이터 품질·최신성, 동기화, 운영 로그, 발송 상태, 수신자 채널 관리
- 외부 데이터가 비거나 깨지는 상황을 고려한 validation, fallback, 운영 로그 설계
- AI와 함께 문제 정의 → 대안 검토 → 작은 변경 → 실제 근거 검증 → 채택·보류·제거를 반복

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
- Web Push

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

- 확정/희망 공모가, 최소청약금액, 최소청약주수, 환불일을 첫 핵심 정보로 표시
- 청약 기간과 주관사를 핵심 정보 바로 아래에서 확인
- 기관 경쟁률, 의무보유확약률, 총 공모주식수, 신주·구주 비중 등은 확보된 값만 보조 정보로 표시
- 공시 기반 체크 포인트 제공
- source metadata와 admin-only 정보는 공개 화면에서 숨김

### Admin

- 관리자 로그인
- 운영 로그 확인
- 진행 종목의 데이터 품질·수집 최신성 요약과 종목별 누락 사유 확인, 스팩 알림 제외 구분
- 기존 daily sync 전체 강제 실행과 성공/실패 피드백
- 알림 발송 상태 확인
- 수신자 이메일 채널 관리
- 10시 자동 알림의 이메일 / 앱푸시 on-off 관리
- 현재 기기 앱푸시 저장, 해제, 테스트 발송
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

- 청약 마감 당일 오전 분석 알림 준비
- Vercel Cron 기반 prepare/dispatch 분리
- 같은 날 이미 준비된 job 재사용
- 이미 발송된 job 재준비 방지
- 늦게 실행된 dispatch의 stale 처리
- delivery claim으로 중복 발송 방지
- 이메일 / 앱푸시 채널별 delivery idempotency key 분리
- Web Push 구독 만료 응답(`404` / `410`)은 unverified 처리
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
- 운영자는 왜 알림이 보내졌는지, 왜 보내지지 않았는지 추적할 수 있어야 함

따라서 핵심 개발 방향은 기능 추가보다 `데이터 신뢰도`, `idempotency`, `공개/관리자 경계`, `운영 로그`, `장애 추적 가능성`을 함께 챙기는 것입니다.

## AI-Assisted Service Improvement

AI 활용 능력은 좋은 프롬프트를 한 번 작성하거나 많은 코드를 생성하는 능력만을 뜻하지 않습니다. 이 프로젝트에서는 AI의 제안을 서비스 맥락에 맞게 좁히고, 신뢰할 수 있는 근거로 검증한 뒤 채택·수정·보류·제거하는 능력을 중요하게 봅니다.

### Responsibility And Evidence

| 구분 | 담당 | 확인 근거 |
| --- | --- | --- |
| 제품 판단 | 사용자가 문제, 우선순위, 공개 범위와 위험 수용 여부를 결정 | 사용자 목표, 실제 사용 흐름, 운영 요구 |
| 탐색과 실행 | AI가 관련 코드·문서 탐색, 대안 제시, 작은 구현과 테스트를 지원 | diff, 타입, lint, 테스트 결과 |
| 최종 검증 | 사용자가 AI 결과를 실제 서비스 조건에서 검토하고 승인 | 원천 데이터, DB·운영 로그, Browser·Network, 배포 결과 |

### Decision Loop

1. 실제 사용이나 운영에서 문제를 관찰합니다.
2. 목표, 성공 기준, 바꾸면 안 되는 경계를 정리합니다.
3. AI와 현재 코드·데이터 흐름을 확인하고 가능한 대안을 비교합니다.
4. 가장 작은 변경을 구현합니다.
5. 테스트뿐 아니라 실제 데이터, 로그와 화면에서 결과를 검증합니다.
6. 근거가 부족하면 기능을 보류하거나 숨기고, 결정 이유를 문서에 남깁니다.

### Decisions Produced By This Process

- 점수 계산 코드는 구현했지만 데이터 신뢰도와 표현 책임이 충분하지 않아 공개 rollout을 중단했습니다.
- 경쟁 서비스의 많은 정보 항목을 그대로 복제하지 않고, 현재 확보 가능한 핵심 정보만 모바일 첫 화면에 남겼습니다.
- 미확보 보조 정보는 `데이터 미확보` 행을 반복하기보다 행 자체를 숨겨 정보 밀도를 낮췄습니다.
- 알림 누락을 브라우저 문제로 추측하지 않고, KST 운영 로그와 job/delivery 상태를 확인해 cron 지연과 동시 prepare 경합을 보완했습니다.
- 공개 화면과 관리자 화면의 데이터 투영을 분리해 source key, 수집 시각과 운영 상태가 공개되지 않게 유지했습니다.

상세한 판단 기준과 회고는 [AI Development Reflection](/Users/shs/Desktop/Study/ipo/docs/context/ai-development-reflection.md)에 기록합니다.

## Portfolio Notes

이 프로젝트에서 강조할 수 있는 경험은 구현 기술뿐 아니라 AI 결과를 서비스 판단으로 전환한 과정입니다.

- 사용자의 문제를 성공 기준과 검증 방법으로 구체화
- AI가 제안한 구현의 데이터 흐름, 공개 범위와 회귀 위험 검토
- 신뢰도가 부족한 점수 UI를 보류하고 근거 중심 UI로 전환
- 실제 운영 로그를 근거로 알림 누락 원인을 분리하고 안정성 개선
- 경쟁 화면을 참고하되 확보 가능한 데이터만 선별해 정보 위계 재구성
- Next.js App Router 기반 공개·관리자·job API 통합 서비스 설계
- 공개 페이지, 관리자 페이지, 서버 액션, route handler를 함께 구성
- Prisma/PostgreSQL 기반 데이터 모델링
- 외부 데이터 수집과 정규화
- Vercel Cron 기반 scheduled job 설계
- 이메일 / 앱푸시 알림 pipeline과 중복 발송 방지
- 공개/관리자 데이터 경계 분리
- 운영 로그와 장애 추적 가능성 확보
- AI-assisted workflow에서 문제 정의, 대안 비교, 작은 구현, 실제 근거 검증과 결정 기록

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
npm run web-push:generate-keys
```

## Required Runtime Notes

- Node 버전은 `v24.14.0`
- 날짜/스케줄 판단은 항상 `Asia/Seoul`
- 홈 `/`는 `5분` 캐시를 사용
- 공개 read path와 알림 idempotency 규칙은 [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)에 유지
- UI/제품 노출 정책은 [product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)에 유지

## Notification Channels

- 기본 운영값은 `이메일 ON`, `앱푸시 OFF`입니다.
- `/admin/recipients`에서 이메일과 앱푸시를 각각 켜고 끌 수 있습니다.
- 앱푸시는 관리자 수신자 기준으로 먼저 연결되어 있으며, 현재 기기를 수신 대상으로 저장한 뒤 테스트 발송할 수 있습니다.
- iPhone/iPad는 Safari 탭이 아니라 홈 화면에 추가한 PWA에서 앱푸시 수신을 기대할 수 있습니다.
- 다음 10시 자동 알림의 실제 수신 채널은 `/admin/recipients`의 `알림 채널 설정` 상태 문구를 기준으로 확인합니다.
- 푸시 알림을 터치하면 알림 payload의 URL로 이동하며, 이미 열린 앱 창이 있으면 이동 중 오버레이와 스피너를 보여 줍니다.
- 새 창이나 콜드 스타트로 열리는 경우에는 전역 loading 화면에서 요청한 화면을 불러오는 중임을 표시합니다.

## Document Map

- 작업자/AI 진입점: [`AGENTS.md`](/Users/shs/Desktop/Study/ipo/AGENTS.md)
- 사람용 문서 지도: [`docs/README.md`](/Users/shs/Desktop/Study/ipo/docs/README.md)
- 구현 후보 backlog: [`TODO.md`](/Users/shs/Desktop/Study/ipo/TODO.md)
- AI 작업자용 읽기 순서: [`docs/context/README.md`](/Users/shs/Desktop/Study/ipo/docs/context/README.md)
- 프로젝트 개요: [`docs/context/project-overview.md`](/Users/shs/Desktop/Study/ipo/docs/context/project-overview.md)
- 런타임/운영: [`docs/context/runtime-and-ops.md`](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- 데이터/점수: [`docs/context/data-and-scoring.md`](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- 제품/UI: [`docs/context/product-surface.md`](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
- AI 서비스 판단·개선 회고: [`docs/context/ai-development-reflection.md`](/Users/shs/Desktop/Study/ipo/docs/context/ai-development-reflection.md)
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
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `IPO_SOURCE_URL`
- `OPENDART_API_KEY`
- `SEIBRO_SERVICE_KEY`
