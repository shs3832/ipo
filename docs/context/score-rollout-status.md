# Score Rollout Status

## Current State

- 기준 시점: `2026-03-29`
- 공개 홈, 상세, 메일의 정량 점수 노출은 현재 pause 상태다.
- 점수 시스템 코드와 DB 구조는 삭제하지 않고 유지한다.
- admin score summary data는 유지하지만, 현재 UI는 숨겨 둔다.

## Why It Is Paused

- 점수 해석이 사람마다 크게 달라질 수 있다.
- 소스 커버리지가 아직 종목별로 고르지 않다.
- 현재 단계에서는 `추천형 점수`보다 `공시 기반 체크 포인트`가 더 안전한 공개 UX라고 판단했다.

## Current Code Switches

### Runtime

- [src/lib/jobs.ts](/Users/shs/Desktop/Study/ipo/src/lib/jobs.ts)
  - 현재는 facade/export 호환 레이어만 남겨 둔다.
- [src/lib/server/ipo-sync-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-sync-service.ts)
  - `syncScoringArtifactsSafely()`는 no-op이다.
  - `runScoringAuditSafely()`는 no-op이다.
  - 원래 점수 sync / queue / recalc 호출은 주석으로 남겨 두었다.
- [src/lib/server/ipo-read-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-read-service.ts)
  - public home/detail/dashboard read model은 현재 `getPublicIpoScoreMap()`을 붙이지 않는다.
- [src/lib/server/alert-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/alert-service.ts)
  - closing-day / closing-soon 메일도 점수 대신 체크 포인트 중심 문구를 쓴다.

### Public UI

- [src/app/home-content.tsx](/Users/shs/Desktop/Study/ipo/src/app/home-content.tsx)
  - 점수 상태 배지와 `종합점수` 행은 `scoreHidden` 클래스로 숨겨 둔다.
- [src/app/ipos/[slug]/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/ipos/[slug]/page.tsx)
  - 점수 pill, 점수 카드, 산출 근거 블록은 `scoreHidden` 클래스로 숨겨 둔다.
- [src/app/admin/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/admin/page.tsx)
  - `V2 점수 상태` 카드는 `scoreHidden` 클래스로 숨겨 둔다.
- CSS 위치:
  - [src/app/home-content.module.scss](/Users/shs/Desktop/Study/ipo/src/app/home-content.module.scss)
  - [src/app/ipos/[slug]/page.module.scss](/Users/shs/Desktop/Study/ipo/src/app/ipos/[slug]/page.module.scss)
  - [src/app/admin/page.module.scss](/Users/shs/Desktop/Study/ipo/src/app/admin/page.module.scss)

## Reopen Checklist

1. [src/lib/server/ipo-sync-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-sync-service.ts)에서 no-op 처리한 점수 sync / recalc helper를 원래 호출로 복구한다.
2. [src/lib/server/ipo-read-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/ipo-read-service.ts) public read path에 `getPublicIpoScoreMap()` join을 다시 붙인다.
3. [src/app/home-content.tsx](/Users/shs/Desktop/Study/ipo/src/app/home-content.tsx)와 [src/app/ipos/[slug]/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/ipos/[slug]/page.tsx)에서 `scoreHidden` 클래스를 제거한다.
4. [src/lib/server/alert-service.ts](/Users/shs/Desktop/Study/ipo/src/lib/server/alert-service.ts) 메일 정책을 다시 정한다.
   현재는 점수를 숨기고 있으므로, 재오픈 시 closing-day / closing-soon 문구를 함께 점검해야 한다.
5. 공개 전 검증을 다시 한다.
   source coverage, score explanation quality, cache invalidation, scoring availability fail-soft, 실제 결과 검토를 함께 확인한다.
6. 문서를 다시 동기화한다.
   `AGENTS.md`, `README.md`, `docs/context/*`, `docs/ipo-score-architecture.md`, `issue.md`를 같이 맞춘다.

## Related Docs

- 데이터/점수 맥락: [data-and-scoring.md](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
- 제품/UI 맥락: [product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
- 점수 설계 상세: [docs/ipo-score-architecture.md](/Users/shs/Desktop/Study/ipo/docs/ipo-score-architecture.md)
- 스레드 로그: [issue.md](/Users/shs/Desktop/Study/ipo/issue.md)
