# Data And Scoring

## Source Priority

현재 수집 우선순위는 아래 흐름을 따른다.

1. `IPO_SOURCE_URL`
2. `OpenDART`
3. `KIND`
4. `SEIBro`
5. Broker Web
6. empty fallback

## Source Responsibilities

### OpenDART

- 공시/재무/증권신고서 중심
- 안정적으로 가져오는 값:
  - 종목명
  - 시장
  - 주관사
  - 청약 일정
  - 공모가
  - 재무 일부
- 한계:
  - 확약/경쟁/유통 전부를 단독 완성 못 함

### KIND

- 일정/세부 보강
- 보강 값:
  - listing date
  - offer detail
  - float/tradable shares
  - listing open price

### SEIBro

- 보호예수 관련 보강
- 현재는 시장 컨텍스트 보강과 lockup 근거 보조 역할

### Broker Web

- 일반청약 경쟁률
- 청약 수수료
- 최고청약한도
- 온라인 전용 제한
- 일부 브로커는 종목별 공지/PDF에서 균등/비례/배정물량까지 보강

## Current Data Flow

1. source adapter fetch
2. normalize + checksum
3. legacy `Ipo` upsert
4. public/admin/mail read

점수 시스템 구현 코드는 별도로 유지하고 있지만, 현재 공개 rollout은 pause 상태다.
자세한 상태와 재오픈 메모는 [score-rollout-status.md](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)를 기준으로 본다.

## Scoring Tables

- `ipo_master`
- `ipo_supply`
- `ipo_demand`
- `ipo_subscription`
- `ipo_market_perf`
- `issuer_financials`
- `ipo_score_snapshot`
- `ipo_recalc_queue`

세부 설계는 [docs/ipo-score-architecture.md](/Users/shs/Desktop/Study/ipo/docs/ipo-score-architecture.md)를 기준으로 본다.

## Current Score System Status

- 점수 계산기와 fact table은 코드베이스에 유지
- `daily-sync`의 점수 fact sync / queue / snapshot 갱신은 현재 멈춰 둔 상태
- 공개 홈, 상세, 메일은 더 이상 `latest ipo_score_snapshot`을 읽지 않음
- admin score summary data는 남기되, 현재 UI는 숨겨 둔다
- 재오픈 체크리스트는 [score-rollout-status.md](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)에 정리

## Current Score Reality

- 현재 버전은 `v2.4`
- 공개 축:
  - 유통
  - 확약
  - 경쟁
  - 마켓
  - 종합
- 실제 운영상 `마켓`은 아직 비어 있는 종목이 많고, V3에서 고도화 예정

## Known Non-Critical Review Notes

- public rollout을 다시 열면 cache invalidation과 scoring availability review note를 먼저 다시 본다
- delegate-missing guard와 fail-soft 동작은 재오픈 시 추가 정리가 필요하다
