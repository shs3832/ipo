<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before making framework-level assumptions.
<!-- END:nextjs-agent-rules -->

# Agent Notes

이 파일은 짧은 운영 규칙과 문서 진입점만 담습니다.
자세한 프로젝트 맥락은 `docs/context/` 아래 문서를 기준으로 읽습니다.

## Read Order

1. [`docs/context/README.md`](/Users/shs/Desktop/Study/ipo/docs/context/README.md)
2. 작업과 관련된 세부 문서
3. [`issue.md`](/Users/shs/Desktop/Study/ipo/issue.md)

## Must-Know Rules

- 작업 전 항상 `source ~/.nvm/nvm.sh && nvm use`
- 프로젝트 Node 버전은 `v24.14.0`
- 시간대 기준은 항상 `Asia/Seoul`
- 사용자가 `md 파일 업데이트`를 요청하면 먼저 [`issue.md`](/Users/shs/Desktop/Study/ipo/issue.md)에 이번 스레드 변경 요약을 기록
- 공개 read path에서는 recipient bootstrap 같은 DB write를 하지 않음
- 알림/발송 로직은 항상 idempotent 유지
- admin 전용 메타데이터는 공개 화면에 노출하지 않음
- 공개 점수 rollout은 현재 pause 상태이며, 홈/상세 점수 UI는 숨겨져 있음
- 점수 재오픈 기준과 코드 복구 포인트는 [`docs/context/score-rollout-status.md`](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)를 먼저 확인
- 홈 `/`는 `revalidate = 300`

## Fast Links

- 문서 인덱스: [`docs/README.md`](/Users/shs/Desktop/Study/ipo/docs/README.md)
- 프로젝트 개요: [`docs/context/project-overview.md`](/Users/shs/Desktop/Study/ipo/docs/context/project-overview.md)
- 런타임/운영: [`docs/context/runtime-and-ops.md`](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- 데이터/점수: [`docs/context/data-and-scoring.md`](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- 점수 공개 상태: [`docs/context/score-rollout-status.md`](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)
- 제품/UI: [`docs/context/product-surface.md`](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
- 점수 설계 상세: [`docs/ipo-score-architecture.md`](/Users/shs/Desktop/Study/ipo/docs/ipo-score-architecture.md)
- 스레드 로그: [`issue.md`](/Users/shs/Desktop/Study/ipo/issue.md)

## Code Starting Points

- 잡 facade / 기존 import 진입점: [`src/lib/jobs.ts`](/Users/shs/Desktop/Study/ipo/src/lib/jobs.ts)
- 서버 read / sync / alert service: [`src/lib/server/ipo-read-service.ts`](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-read-service.ts), [`src/lib/server/ipo-sync-service.ts`](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-sync-service.ts), [`src/lib/server/alert-service.ts`](/Users/shs/Desktop/Study/ipo/src/lib/server/alert-service.ts)
- recipient / mapper / shared helper: [`src/lib/server/recipient-service.ts`](/Users/shs/Desktop/Study/ipo/src/lib/server/recipient-service.ts), [`src/lib/server/ipo-mappers.ts`](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-mappers.ts), [`src/lib/server/job-shared.ts`](/Users/shs/Desktop/Study/ipo/src/lib/server/job-shared.ts)
- 점수 저장/재계산: [`src/lib/ipo-score-store.ts`](/Users/shs/Desktop/Study/ipo/src/lib/ipo-score-store.ts)
- 점수 계산기: [`src/lib/scoring`](/Users/shs/Desktop/Study/ipo/src/lib/scoring)
- 공개 홈 캐시: [`src/lib/page-data.ts`](/Users/shs/Desktop/Study/ipo/src/lib/page-data.ts)
- 관리자 인증: [`src/lib/admin-auth.ts`](/Users/shs/Desktop/Study/ipo/src/lib/admin-auth.ts)
- 운영 로그: [`src/lib/ops-log.ts`](/Users/shs/Desktop/Study/ipo/src/lib/ops-log.ts)

## Documentation Policy

- 같은 맥락을 여러 md 파일에 반복해서 복붙하지 않음
- 짧은 요약은 상위 문서에 두고, 세부 내용은 하위 문서로 분리
- 기준 문서가 바뀌면 링크 문서를 고치고, 중복 설명은 줄이는 방향을 우선함
