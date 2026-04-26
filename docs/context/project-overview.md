# Project Overview

이 문서는 AI 작업자가 프로젝트의 현재 모습을 빠르게 복원하기 위한 내부 요약이다.
외부 제출/포트폴리오용 설명은 [README.md](/Users/shs/Desktop/Study/ipo/README.md)를 기준으로 보고, 세부 운영 정책은 각 context 문서를 기준으로 본다.

## Identity

- 개인용 공모주 일정/분석/알림 서비스
- 현재 운영 목표:
  - 캘린더
  - 오전 10시 분석 메일
  - 관리자 운영 화면
- 서비스 특성상 중요한 것:
  - 정확한 일정
  - 중복 없는 알림
  - 운영 로그

## Stack

- Next.js 16 App Router
- React 19
- Prisma + PostgreSQL
- Neon
- Vercel deployment + Cron
- Nodemailer + Gmail SMTP
- OpenDART / KIND / SEIBro / Broker Web

## Current Product Shape

- 홈 `/`
  - 월간 캘린더
  - 종목 개요 카드
  - 공시 기반 핵심 정보 표시
- 상세 `/ipos/[slug]`
  - 지금 판단용 quick facts
  - 체크 포인트 / 일정 / 상세 데이터
- 관리자 `/admin`
  - 운영 로그
  - 수신자 상태
  - 점수 상태 요약 데이터는 남기되 UI는 현재 숨김

## Main Code Starting Points

- facade / 기존 import 진입점: [src/lib/jobs.ts](/Users/shs/Desktop/Study/ipo/src/lib/jobs.ts)
- 서버 read / sync / alert service: [src/lib/server/ipo-read-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-read-service.ts), [src/lib/server/ipo-sync-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-sync-service.ts), [src/lib/server/alert-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/alert-service.ts)
- recipient / mapper / shared helper: [src/lib/server/recipient-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/recipient-service.ts), [src/lib/server/ipo-mappers.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-mappers.ts), [src/lib/server/job-shared.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/job-shared.ts)
- 점수 저장/재계산: [src/lib/ipo-score-store.ts](/Users/shs/Desktop/Study/ipo/src/lib/ipo-score-store.ts)
- 점수 계산기: [src/lib/scoring](/Users/shs/Desktop/Study/ipo/src/lib/scoring)
- 공개 캐시: [src/lib/page-data.ts](/Users/shs/Desktop/Study/ipo/src/lib/page-data.ts)
- 운영 로그: [src/lib/ops-log.ts](/Users/shs/Desktop/Study/ipo/src/lib/ops-log.ts)

## Current Status Snapshot

- 공개 점수 rollout은 현재 pause 상태
- 홈/상세에서는 점수 UI를 숨기고 체크 포인트 중심으로 노출
- admin score summary data는 남기되, 현재 UI는 숨긴 상태
- 점수 재오픈 기준과 복구 포인트는 [score-rollout-status.md](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)를 기준으로 본다

## Read Next

- 운영 흐름: [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- 데이터와 점수: [data-and-scoring.md](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- UI/제품 결정: [product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
