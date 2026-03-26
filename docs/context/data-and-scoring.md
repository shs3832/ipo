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
4. scoring fact table sync
5. `ipo_recalc_queue`
6. score snapshot create
7. public/admin/mail read

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

## Current Score Exposure Rules

- 공개 화면은 `latest ipo_score_snapshot`을 사용
- `READY`면 그대로 공개
- `PARTIAL`도 `totalScore`가 있으면 공개
- `publicScore.totalScore == null`이면 화면에는 `산출 대기`

## Why A Score Can Be Missing Or Partial

### `산출 대기`

주로 두 경우다.

1. 실제 최신 score snapshot이 없음
2. public scoring read가 fail-soft로 `publicScore = null`이 됨

현재 실DB 기준 latest snapshot 분포는 `READY 10 / PARTIAL 6 / NOT_READY 0`이었다.
따라서 개발 환경에서 `산출 대기`가 다수 보이면 데이터 부족보다 runtime scoring read 문제를 먼저 본다.

### `PARTIAL`

총점은 있어도 일부 서브점수가 비는 상태다.

대표 원인:

- `유통점수` 부족:
  - float / tradable / listed share 부족
- `확약점수` 부족:
  - lockup ratio 부족
- `재무 보정` 부족:
  - 최신 financial fact 부족

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

- public cache invalidation이 즉시 붙지 않아 재계산 직후 최대 `5분` stale 가능
- scoring availability fail-soft는 일시 mismatch 후 process lifetime 동안 latch-off 될 수 있음
- delegate-missing guard는 현재 운영 보호용이며, 추후 더 정교하게 좁힐 여지가 있음
