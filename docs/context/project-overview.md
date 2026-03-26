# Project Overview

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
  - 공개 종목 점수 표시
- 상세 `/ipos/[slug]`
  - 지금 판단용 quick facts
  - 종합점수 + 서브점수
  - 체크 포인트 / 일정 / 상세 데이터
- 관리자 `/admin`
  - 운영 로그
  - 수신자 상태
  - 점수 상태 요약

## Main Code Starting Points

- 공개/관리자 read + 잡: [src/lib/jobs.ts](/Users/shs/Desktop/Study/ipo/src/lib/jobs.ts)
- 점수 저장/재계산: [src/lib/ipo-score-store.ts](/Users/shs/Desktop/Study/ipo/src/lib/ipo-score-store.ts)
- 점수 계산기: [src/lib/scoring](/Users/shs/Desktop/Study/ipo/src/lib/scoring)
- 공개 캐시: [src/lib/page-data.ts](/Users/shs/Desktop/Study/ipo/src/lib/page-data.ts)
- 운영 로그: [src/lib/ops-log.ts](/Users/shs/Desktop/Study/ipo/src/lib/ops-log.ts)

## Current Status Snapshot

- 공개 점수는 현재 `ipo_score_snapshot` 기준으로 노출 중
- 최신 실DB 기준 score snapshot 분포:
  - `READY 10`
  - `PARTIAL 6`
- `PARTIAL`도 총점이 있으면 공개
- 일부 종목은 소스 커버리지 부족으로 서브점수만 비어 있을 수 있음

## Read Next

- 운영 흐름: [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- 데이터와 점수: [data-and-scoring.md](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- UI/제품 결정: [product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
