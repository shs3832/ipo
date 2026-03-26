# IPO Score Architecture Proposal

## Goal

현 프로젝트의 기존 `buildAnalysis()` 중심 휴리스틱을, 다음 특성을 갖는 점수 시스템으로 확장한다.

- 종목별 점수 구성:
  - 유통분석
  - 확약분석
  - 경쟁분석
  - 마켓분석
  - 종합점수
- 점수는 1회 계산 후 고정하지 않는다.
- 최소 하루 1회 전체 종목 점검 배치가 필요하다.
- 정정 공시, 일정 변경, 보조 소스 변경이 감지되면 해당 종목만 즉시 재계산한다.
- OpenDART 중심 구조를 유지하되, 점수 산정은 멀티소스 전제로 분리한다.

## Current Exposure Status

현재 기준 공개 화면은 최신 `ipo_score_snapshot`을 직접 읽어 점수를 노출한다.

- 홈 `/`
  - 종목 카드에 `종합점수`와 상태 배지를 표시한다.
- 상세 `/ipos/[slug]`
  - 히어로 카드에 `종합점수`, `유통`, `확약`, `경쟁`, `마켓`, `재무 보정`을 표시한다.
- 메일/리마인더
  - 공개 화면과 같은 점수 스냅샷 설명을 우선 사용한다.

현재 노출 규칙은 다음과 같다.

- `total_score`가 있으면 `READY`뿐 아니라 `PARTIAL`도 공개한다.
- `publicScore.totalScore == null`이면 화면에는 `산출 대기`로 표시한다.
- `PARTIAL` 상태에서는 일부 서브점수가 `데이터 미확보`로 남을 수 있다.

운영 메모:

- 2026-03-26 실DB 기준 latest snapshot 분포는 `READY 10 / PARTIAL 6 / NOT_READY 0`이었다.
- 따라서 개발 환경에서 `산출 대기`가 다수 보이면, 실제 미산출보다 public scoring read fail-soft를 먼저 의심하는 편이 맞다.

## Current Codebase Fit

현재 구조에서 점수 관련 핵심 병목은 다음 두 가지다.

1. `src/lib/jobs.ts`의 `daily-sync`가 소스 병합, DB 저장, 분석 생성까지 한 번에 수행한다.
2. `src/lib/analysis.ts`의 `buildAnalysis()`가
   - 점수 계산
   - 판단 문구 생성
   - 공개 여부 판단
   를 한 함수에 함께 담고 있다.

새 구조에서는 이를 다음처럼 분리한다.

- 수집: source adapter + ingest writer
- 저장: master / fact table / snapshot
- 계산: scoring engine
- 표현: analysis formatter

즉, `analysis.ts`는 "계산 엔진"이 아니라 "표현 레이어"로 축소하고, 점수 계산은 별도 `scoring/` 모듈로 이동한다.

## Target Architecture

```text
OpenDART / KIND / SEIBro / KRX / Broker Web
                |
                v
         source adapters
                |
                v
     normalize + source checksum
                |
                v
     fact table upsert writers
                |
        +-------+--------+
        |                |
        v                v
 change detection   daily full audit
        |                |
        +-------+--------+
                v
         ipo_recalc_queue
                |
                v
          scoring engine
                |
                v
      ipo_score_snapshot / component rows
                |
                v
      analysis formatter / public-admin reads
```

현재 구현 메모:

- admin, public, mail이 같은 `ipo_score_snapshot`을 재사용하는 방향으로 맞춰졌다.
- 다만 public cache는 아직 즉시 무효화가 붙지 않아 재계산 직후 최대 `5분` 정도 stale score가 노출될 수 있다.
- scoring store는 runtime mismatch 시 fail-soft 하도록 되어 있지만, 현재 가드는 일시 실패 후 process lifetime 동안 latch-off 될 수 있는 `P2` 개선 여지가 남아 있다.

## Source Responsibility

### OpenDART

- 역할:
  - `ipo_master` 기본 식별자/일정/공모가 밴드
  - `issuer_financials`
  - 일부 `ipo_supply`
- 특징:
  - 공시/재무/증권신고서 중심
  - 단독으로는 경쟁점수, 확약점수 완성 불가

### SEIBro

- 역할:
  - 보호예수 비율/확약 보강
- 우선 사용처:
  - `ipo_supply.lockup_ratio`
  - 향후 확약 만기 구간 분해

### KRX Open API

- 역할:
  - 상장 후 성과
  - 시장 통계
- 우선 사용처:
  - `ipo_market_perf`
  - V3 마켓 점수

### KIND

- 역할:
  - 일정/세부 보조 웹 소스
  - float/tradable shares 보강
- 우선 사용처:
  - `ipo_master`
  - `ipo_supply`

### 증권사 공지/웹

- 역할:
  - 청약 경쟁률
  - 균등/비례
  - 청약 한도
  - 수수료
- 우선 사용처:
  - `ipo_demand`
  - `ipo_subscription`

현재 구현 메모:

- 공식 브로커 가이드 기반으로 `한국투자증권`, `신한투자증권`, `KB증권`, `미래에셋증권`을 수집 중이다.
- 현재 안정적으로 적재되는 구조화 필드는 `subscription_fee`, `has_online_only_condition`, `maximum_subscription_shares(한투)` 중심이다.
- 브로커 웹은 `EUC-KR` 페이지가 많아 charset-aware decode를 전제로 유지한다.
- 브로커 표기가 `케이비증권 / KB증권`, `엔에이치투자증권 / NH투자증권`처럼 섞일 수 있으므로 canonical normalize key가 필요하다.
- `equal_allocated_shares`, `proportional_allocated_shares`는 향후 종목별 공지/PDF 파서 추가가 필요한 단계다.

## Data Model

사용자 요구의 필수 테이블 6개를 중심으로, 운영을 위해 2개 보조 테이블을 추가한다.

### 1. `ipo_master`

종목의 기준 엔티티다. 현재 `Ipo` 모델을 사실상 대체하거나, 초기 단계에서는 `Ipo`와 병행 운용한다.

권장 컬럼:

- `id`
- `slug`
- `issuer_name`
- `market`
- `corp_code`
- `stock_code`
- `kind_issue_code`
- `kind_biz_process_no`
- `lead_manager`
- `co_managers` JSONB
- `price_band_low`
- `price_band_high`
- `offer_price`
- `subscription_start`
- `subscription_end`
- `refund_date`
- `listing_date`
- `status`
- `latest_disclosure_no`
- `source_priority_version`
- `last_source_seen_at`
- `last_fact_refreshed_at`
- `last_score_calculated_at`
- `created_at`
- `updated_at`

핵심 원칙:

- 종목의 현재 대표값만 둔다.
- 계산 근거가 되는 세부 팩트는 이 테이블에 과도하게 넣지 않는다.

### 2. `ipo_supply`

유통/확약 분석용 팩트 테이블이다.

권장 컬럼:

- `id`
- `ipo_id`
- `source_type`
- `source_key`
- `source_ref`
- `as_of_date`
- `total_offered_shares`
- `new_shares`
- `secondary_shares`
- `listed_shares`
- `tradable_shares`
- `float_ratio`
- `insider_sales_ratio`
- `lockup_confirmed_shares`
- `lockup_ratio`
- `lockup_detail_json`
- `confidence`
- `checksum`
- `is_latest`
- `collected_at`
- `created_at`
- `updated_at`

메모:

- 확약 분석은 별도 테이블로도 나눌 수 있지만, 초기 요구 DB를 맞추기 위해 `lockup_*`을 `ipo_supply`에 포함한다.
- 이후 필요 시 `ipo_lockup_tranche`를 추가해 확약 만기별 세부 분해가 가능하다.

### 3. `ipo_demand`

수요예측과 기관 경쟁 분석용 팩트 테이블이다.

권장 컬럼:

- `id`
- `ipo_id`
- `source_type`
- `source_key`
- `source_ref`
- `demand_forecast_start`
- `demand_forecast_end`
- `institutional_competition_rate`
- `price_band_top_acceptance_ratio`
- `price_band_exceed_ratio`
- `participating_institutions`
- `order_quantity`
- `bid_distribution_json`
- `confidence`
- `checksum`
- `is_latest`
- `collected_at`
- `created_at`
- `updated_at`

메모:

- V2에서 경쟁점수의 핵심 입력 테이블이다.
- OpenDART로 빈칸이 많을 수 있으므로 source provenance를 강하게 남긴다.

### 4. `ipo_subscription`

증권사별 일반청약 정보를 저장한다.

권장 컬럼:

- `id`
- `ipo_id`
- `broker_name`
- `broker_code`
- `source_type`
- `source_key`
- `source_ref`
- `subscription_start`
- `subscription_end`
- `general_competition_rate`
- `allocated_shares`
- `equal_allocated_shares`
- `proportional_allocated_shares`
- `minimum_subscription_shares`
- `maximum_subscription_shares`
- `deposit_rate`
- `subscription_fee`
- `has_online_only_condition`
- `confidence`
- `checksum`
- `is_latest`
- `collected_at`
- `created_at`
- `updated_at`

메모:

- 브로커별 row를 저장하고, 필요하면 집계 view로 종목 통합값을 만든다.
- 현재 앱의 `minimumSubscriptionShares`, `depositRate`, `generalSubscriptionCompetitionRate`는 장기적으로 여기서 읽는 것이 맞다.
- `subscriptionFee`, `hasOnlineOnlyCondition`, `maximumSubscriptionShares`, `allocatedShares`처럼 브로커별 차이가 나는 값은 이 테이블을 단일 truth source로 본다.
- 현재 연결된 브로커 공식 가이드 소스는 `한국투자증권`, `신한투자증권`, `KB증권`, `미래에셋증권`, `삼성증권`, `하나증권`이다.
- 현재 연결된 종목별 브로커 공지 소스는 `대신증권 모바일 공지 보드 + 첨부 PDF`이며, 여기서 `general_competition_rate`, `allocated_shares`, `equal_allocated_shares`, `proportional_allocated_shares`를 보강한다.

## Current Scoring Status

현재 내부 경쟁점수는 `v2.4` 기준으로 다음 브로커 입력을 반영한다.

- 기관 수요예측 경쟁률
- 일반청약 경쟁률
- 일반청약 배정물량
- 균등 배정물량
- 최소청약주수
- 최고청약한도
- 증거금률
- 청약 수수료
- 온라인 전용 제한 여부

즉, 브로커 웹 수집은 단순 부가 메모가 아니라 `competitionScore`의 실제 입력 팩트로 연결된다.  
특히 `대신증권`처럼 종목별 결과 공지와 PDF가 있는 경우, 브로커 issue notice가 generic guide보다 우선하는 source layer로 동작한다.

### 5. `ipo_market_perf`

상장 후 성과와 시장 환경을 함께 담는 테이블이다.

권장 컬럼:

- `id`
- `ipo_id`
- `source_type`
- `source_key`
- `as_of_date`
- `listing_open_price`
- `listing_open_return_rate`
- `day1_close_price`
- `day1_close_return_rate`
- `week1_return_rate`
- `month1_return_rate`
- `kospi_return_same_window`
- `kosdaq_return_same_window`
- `sector_return_same_window`
- `recent_ipo_heat_score`
- `checksum`
- `is_latest`
- `collected_at`
- `created_at`
- `updated_at`

메모:

- 현재 `listingOpenPrice`, `listingOpenReturnRate`, `marketMoodScore`를 한데 모아 장기적으로 여기로 이동한다.
- V3에서 적극 활용한다.

### 6. `issuer_financials`

재무 보정용 시계열 테이블이다.

권장 컬럼:

- `id`
- `ipo_id`
- `corp_code`
- `report_receipt_no`
- `report_code`
- `report_label`
- `statement_type`
- `fiscal_year`
- `fiscal_period`
- `revenue`
- `previous_revenue`
- `revenue_growth_rate`
- `operating_income`
- `previous_operating_income`
- `operating_margin_rate`
- `net_income`
- `previous_net_income`
- `total_assets`
- `total_liabilities`
- `total_equity`
- `debt_ratio`
- `source_key`
- `checksum`
- `is_latest`
- `collected_at`
- `created_at`
- `updated_at`

메모:

- 현재 `src/lib/sources/opendart-financials.ts`의 결과를 그대로 구조화하기 좋다.

### 7. `ipo_score_snapshot` (추가 권장)

실제 계산 결과를 저장하는 테이블이다. 기존 `IpoAnalysis`보다 구조적이어야 한다.

권장 컬럼:

- `id`
- `ipo_id`
- `score_version`
- `status`
- `coverage_status`
- `supply_score`
- `lockup_score`
- `competition_score`
- `market_score`
- `financial_adjustment_score`
- `total_score`
- `component_weights` JSONB
- `inputs_checksum`
- `evidence_summary` JSONB
- `warnings` JSONB
- `explanations` JSONB
- `calculated_at`
- `created_at`

상태 예시:

- `NOT_READY`
- `PARTIAL`
- `READY`
- `STALE`

### 8. `ipo_recalc_queue` (추가 권장)

배치 + 이벤트 기반 재계산을 묶는 큐다.

권장 컬럼:

- `id`
- `ipo_id`
- `reason`
- `trigger_source`
- `trigger_payload` JSONB
- `dedupe_key`
- `status`
- `run_after`
- `attempts`
- `last_error`
- `created_at`
- `updated_at`

핵심 원칙:

- 같은 종목/같은 이유의 중복 재계산은 dedupe한다.
- 변경 감지 후 즉시 계산을 시도하되, 실패 시 큐에 남겨 재시도한다.

## Score Calculation Model

점수는 공개 카드 4개와 내부 보정 1개로 나눈다.

- 공개/관리용 카드:
  - `supplyScore`
  - `lockupScore`
  - `competitionScore`
  - `marketScore`
- 내부 보정:
  - `financialAdjustmentScore`
- 최종:
  - `totalScore`

### V1

입력:

- `ipo_supply`
- `issuer_financials`

계산:

- `supplyScore`
- `lockupScore`
- `financialAdjustmentScore`
- `totalScore = weightedBase + financialAdjustment`

권장 시작 가중치:

- base:
  - 유통 60%
  - 확약 40%
- 재무 보정:
  - `-10 ~ +10` 가산/감산

### V2

입력 추가:

- `ipo_demand`
- `ipo_subscription`

권장 시작 가중치:

- 유통 35%
- 확약 25%
- 경쟁 25%
- 마켓 15%
- 재무 보정 `-10 ~ +10`

주의:

- V2에서 마켓점수 데이터가 아직 비어도 `null` 허용
- 이 경우 `coverage_status = PARTIAL`로 저장

### V3

입력 추가:

- `ipo_market_perf`
- KRX 기반 시장 컨텍스트

권장 시작 가중치:

- 유통 30%
- 확약 20%
- 경쟁 25%
- 마켓 25%
- 재무 보정 `-10 ~ +10`

## Scoring Module Split

권장 디렉터리:

```text
src/lib/scoring/
  types.ts
  constants.ts
  weights.ts
  status.ts
  context.ts
  engine.ts
  evidence.ts
  calculators/
    supply.ts
    lockup.ts
    competition.ts
    market.ts
    financial-adjustment.ts
  formatters/
    analysis-summary.ts
```

책임 분리:

- `context.ts`
  - DB에서 최신 팩트를 읽어 `ScoreContext`를 만든다.
- `calculators/*`
  - 영역별 점수만 계산한다.
- `engine.ts`
  - 버전별 가중치, availability, total score를 결정한다.
- `evidence.ts`
  - 어떤 소스와 값이 점수에 쓰였는지 설명 객체를 만든다.
- `formatters/analysis-summary.ts`
  - 현재 `buildAnalysis()`가 하던 문장 생성을 맡는다.

핵심 타입 예시:

```ts
type ScoreContext = {
  ipo: IpoMaster;
  supply: IpoSupplyFact | null;
  demand: IpoDemandFact | null;
  subscriptions: IpoSubscriptionFact[];
  marketPerf: IpoMarketPerfFact | null;
  financials: IssuerFinancialFact | null;
};

type ScoreComponentResult = {
  name: "supply" | "lockup" | "competition" | "market" | "financialAdjustment";
  score: number | null;
  status: "READY" | "PARTIAL" | "MISSING";
  reasons: string[];
  evidence: Array<{
    field: string;
    value: string | number | null;
    source: string;
  }>;
};
```

## Data Collection Pipeline

### A. Daily Full Audit

최소 하루 1회 전체 종목을 순회한다.

권장 흐름:

1. `sync-ipo-master`
2. `sync-ipo-supply`
3. `sync-issuer-financials`
4. `sync-ipo-demand`
5. `sync-ipo-subscription`
6. `sync-ipo-market-perf`
7. `enqueue-score-recalc --all-dirty`
8. `run-score-recalc`

현재 앱 기준 연결 포인트:

- 기존 `runDailySync()`는 1차적으로 `ipo_master` + 일부 `ipo_supply` 수집기로 축소
- 알림 준비 잡은 점수 계산이 아니라 결과 소비만 담당

### B. Event-Based Change Detection

즉시 재계산 트리거는 "변경 감지"에서 발생한다.

변경 감지 기준:

- OpenDART `rcept_no` 변경
- KIND 일정 값 변경
- SEIBro lockup 값 변경
- 증권사 경쟁률/배정수량/수수료 값 변경
- KRX 상장 후 성과 업데이트

구현 원칙:

- 각 source writer는 upsert 전에 `normalized checksum`을 계산한다.
- checksum이 달라졌고 점수 관련 필드가 바뀌었다면 `ipo_recalc_queue`에 enqueue한다.
- 같은 종목의 중복 enqueue는 `dedupe_key`로 합친다.

## Read Path Strategy

현재 public/admin read path를 유지하되, 점수 데이터는 직접 팩트 테이블을 읽지 않고 최신 snapshot을 읽는다.

- public:
  - `ipo_master`
  - latest `ipo_score_snapshot`
  - 필요 시 요약 evidence
- admin:
  - latest snapshot
  - latest fact rows
  - source provenance
  - queue 상태

현재 `IpoAnalysis`의 활용 방식은 다음처럼 전환하는 것이 좋다.

- 단기:
  - `IpoAnalysis` 유지
  - `ipo_score_snapshot`에서 요약 문구를 만들어 함께 기록
- 중기:
  - `IpoAnalysis`를 presentation cache로만 사용
- 장기:
  - `ipo_score_snapshot` + formatter 기반으로 교체

## Migration Plan

### Phase 1: Dual Write

- 새 테이블 추가
- 기존 `daily-sync`는 그대로 두되, 저장 시
  - `Ipo`
  - `IpoSourceSnapshot`
  - 새 fact tables
  를 함께 적재한다.
- 기존 `buildAnalysis()`는 유지한다.

### Phase 2: New Engine

- `src/lib/scoring/` 도입
- `ipo_score_snapshot` 계산 시작
- admin에서만 새 점수 표시

### Phase 3: Production Cutover

- alert/public detail이 최신 snapshot을 읽도록 전환
- `buildAnalysis()`는 formatter wrapper로 축소

### Phase 4: Cleanup

- `IpoSourceSnapshot.payload`에 너무 많은 계산용 팩트를 쌓지 않도록 정리
- `Ipo` 상위 컬럼 중 fact table로 이동 가능한 값은 최소화

## Recommended File-Level Changes

현재 코드베이스 기준 우선 추가 대상:

- `src/lib/scoring/types.ts`
- `src/lib/scoring/engine.ts`
- `src/lib/scoring/context.ts`
- `src/lib/scoring/calculators/supply.ts`
- `src/lib/scoring/calculators/lockup.ts`
- `src/lib/scoring/calculators/financial-adjustment.ts`
- `src/lib/ingest/upsert-ipo-master.ts`
- `src/lib/ingest/upsert-ipo-supply.ts`
- `src/lib/ingest/upsert-issuer-financials.ts`
- `src/lib/ingest/enqueue-score-recalc.ts`
- `src/lib/jobs/run-score-recalc.ts`

기존 수정 대상:

- `src/lib/jobs.ts`
  - `runDailySync()`를 ingestion orchestrator 중심으로 정리
- `src/lib/analysis.ts`
  - 계산 로직 제거
  - formatter 성격으로 축소
- `prisma/schema.prisma`
  - fact tables + snapshot + queue 추가

## Operational Notes

- 시간 기준은 기존 원칙대로 반드시 `Asia/Seoul`
- `OperationLog`에 다음 액션을 남긴다:
  - `score_recalc_started`
  - `score_recalc_completed`
  - `score_recalc_failed`
  - `score_input_changed`
  - `score_input_unchanged`
- 점수 결과에는 반드시 source provenance와 coverage를 남긴다.
- 공개 노출 전까지는 score visibility를 admin-only 또는 internal flag로 유지하는 것이 안전하다.

## Recommended First Implementation Slice

가장 안전한 첫 구현 범위는 V1이다.

1. Prisma에 `ipo_master`, `ipo_supply`, `issuer_financials`, `ipo_score_snapshot`, `ipo_recalc_queue` 추가
2. 기존 OpenDART + KIND 결과를 위 테이블에 dual-write
3. `supplyScore`, `lockupScore`, `financialAdjustmentScore` 계산기 구현
4. daily batch 후 전체 V1 재계산
5. changed checksum 발생 시 해당 종목만 재계산
6. admin에서만 새 점수와 coverage 노출

이 순서가 좋은 이유:

- 현재 소스만으로도 착수 가능하다.
- OpenDART 단독 한계를 인정하면서도, 구조는 V2/V3로 자연스럽게 확장된다.
- 기존 public alert/detail 흐름을 즉시 깨지 않는다.
