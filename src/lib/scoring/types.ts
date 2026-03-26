export type ScoreComponentKey = "supply" | "lockup" | "competition" | "market" | "financialAdjustment";
export type ScoreVersion = "v1" | "v2" | "v2.1" | "v2.2" | "v2.3" | "v2.4";

export type ScoreComponentStatus = "READY" | "PARTIAL" | "MISSING";
export type ScoreCoverageStatus = "EMPTY" | "PARTIAL" | "SUFFICIENT";
export type ScoreSnapshotStatus = "NOT_READY" | "PARTIAL" | "READY" | "STALE";

export type ScoreEvidenceItem = {
  field: string;
  label: string;
  value: number | string | null;
  source: string;
};

export type ScoreComponentResult = {
  key: ScoreComponentKey;
  score: number | null;
  status: ScoreComponentStatus;
  reasons: string[];
  warnings: string[];
  evidence: ScoreEvidenceItem[];
};

export type V1SupplyFact = {
  source: string;
  floatRatio: number | null;
  insiderSalesRatio: number | null;
  lockupRatio: number | null;
  totalOfferedShares: number | null;
  newShares: number | null;
  secondaryShares: number | null;
  listedShares: number | null;
  tradableShares: number | null;
};

export type V1FinancialFact = {
  source: string;
  reportLabel: string | null;
  revenueGrowthRate: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  debtRatio: number | null;
  totalEquity: number | null;
};

export type V2DemandFact = {
  source: string;
  institutionalCompetitionRate: number | null;
  priceBandTopAcceptanceRatio: number | null;
  priceBandExceedRatio: number | null;
  participatingInstitutions: number | null;
};

export type V2SubscriptionFact = {
  source: string;
  brokerName: string;
  generalCompetitionRate: number | null;
  allocatedShares: number | null;
  equalAllocatedShares: number | null;
  proportionalAllocatedShares: number | null;
  minimumSubscriptionShares: number | null;
  maximumSubscriptionShares: number | null;
  depositRate: number | null;
  subscriptionFee: number | null;
  hasOnlineOnlyCondition: boolean;
};

export type V1ScoreContext = {
  ipoId: string;
  slug: string;
  supply: V1SupplyFact | null;
  financials: V1FinancialFact | null;
  demand?: V2DemandFact | null;
  subscriptions?: V2SubscriptionFact[];
};

export type V2ScoreContext = V1ScoreContext & {
  demand: V2DemandFact | null;
  subscriptions: V2SubscriptionFact[];
};

export type ScoreComponentWeights = {
  supply: number;
  lockup: number;
  competition: number;
  market: number;
};

export type V1ScoreSnapshot = {
  scoreVersion: ScoreVersion;
  status: ScoreSnapshotStatus;
  coverageStatus: ScoreCoverageStatus;
  supplyScore: number | null;
  lockupScore: number | null;
  competitionScore: number | null;
  marketScore: number | null;
  financialAdjustmentScore: number | null;
  totalScore: number | null;
  componentWeights: ScoreComponentWeights;
  inputsChecksum: string;
  evidenceSummary: Record<ScoreComponentKey, ScoreComponentResult>;
  warnings: string[];
  explanations: string[];
  calculatedAt: Date;
};

export type V2ScoreSnapshot = V1ScoreSnapshot & {
  scoreVersion: "v2" | "v2.1" | "v2.2" | "v2.3" | "v2.4";
};
