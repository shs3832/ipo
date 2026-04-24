export const TIME_ZONE = "Asia/Seoul";

export type IpoStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED" | "WITHDRAWN";
export type IpoEventType = "SUBSCRIPTION" | "REFUND" | "LISTING";
export type ChannelType = "EMAIL" | "TELEGRAM";
export type AlertType = "CLOSING_DAY_ANALYSIS";
export type DeliveryStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";
export type JobStatus = "READY" | "SENT" | "PARTIAL_FAILURE";
export type OperationLogLevel = "INFO" | "WARN" | "ERROR";
export type SchedulerHealthStatus = "PENDING" | "HEALTHY" | "LATE" | "MISSED" | "FAILED";

export type SourceBrokerSubscriptionDetail = {
  brokerName: string;
  brokerCode?: string | null;
  sourceKey: string;
  sourceRef?: string | null;
  generalCompetitionRate?: number | null;
  allocatedShares?: number | null;
  equalAllocatedShares?: number | null;
  proportionalAllocatedShares?: number | null;
  minimumSubscriptionShares?: number | null;
  maximumSubscriptionShares?: number | null;
  depositRate?: number | null;
  subscriptionFee?: number | null;
  hasOnlineOnlyCondition?: boolean;
  notes?: string[];
};

export type SourceIpoRecord = {
  sourceKey: string;
  corpCode?: string | null;
  stockCode?: string | null;
  latestDisclosureNo?: string | null;
  name: string;
  market: string;
  leadManager: string;
  coManagers?: string[];
  kindIssueCode?: string | null;
  kindBizProcessNo?: string | null;
  priceBandLow?: number | null;
  priceBandHigh?: number | null;
  offerPrice?: number | null;
  listingOpenPrice?: number | null;
  listingOpenReturnRate?: number | null;
  minimumSubscriptionShares?: number | null;
  depositRate?: number | null;
  generalSubscriptionCompetitionRate?: number | null;
  irStart?: string | null;
  irEnd?: string | null;
  demandForecastStart?: string | null;
  demandForecastEnd?: string | null;
  totalOfferedShares?: number | null;
  newShares?: number | null;
  secondaryShares?: number | null;
  listedShares?: number | null;
  tradableShares?: number | null;
  subscriptionStart: string;
  subscriptionEnd: string;
  refundDate?: string | null;
  listingDate?: string | null;
  status?: IpoStatus;
  demandCompetitionRate?: number | null;
  lockupRate?: number | null;
  lockupDetailJson?: Record<string, unknown> | null;
  brokerSubscriptionDetails?: SourceBrokerSubscriptionDetail[];
  floatRatio?: number | null;
  insiderSalesRatio?: number | null;
  marketMoodScore?: number | null;
  financialReportLabel?: string | null;
  revenue?: number | null;
  previousRevenue?: number | null;
  revenueGrowthRate?: number | null;
  operatingIncome?: number | null;
  previousOperatingIncome?: number | null;
  operatingMarginRate?: number | null;
  netIncome?: number | null;
  previousNetIncome?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  totalEquity?: number | null;
  debtRatio?: number | null;
  notes?: string[];
};

export type IpoEventRecord = {
  id: string;
  type: IpoEventType;
  title: string;
  eventDate: Date;
};

export type IpoAnalysisRecord = {
  score: number;
  ratingLabel: string;
  summary: string;
  keyPoints: string[];
  warnings: string[];
  scoreDisplay: {
    isVisible: boolean;
    evidenceLabels: string[];
    evidenceCount: number;
    demandSupplyEvidenceCount: number;
    financialEvidenceCount: number;
    helpText: string;
    policyNote: string;
    disclaimer: string;
  };
  generatedAt: Date;
};

export type PublicIpoScoreRecord = {
  scoreVersion: string | null;
  status: "NOT_READY" | "PARTIAL" | "READY" | "STALE" | "UNAVAILABLE";
  coverageStatus: "EMPTY" | "PARTIAL" | "SUFFICIENT" | "UNAVAILABLE";
  totalScore: number | null;
  supplyScore: number | null;
  lockupScore: number | null;
  competitionScore: number | null;
  marketScore: number | null;
  financialAdjustmentScore: number | null;
  warnings: string[];
  explanations: string[];
  calculatedAt: Date | null;
};

export type IpoRecord = {
  id: string;
  slug: string;
  name: string;
  market: string;
  leadManager: string;
  coManagers: string[];
  kindIssueCode: string | null;
  kindBizProcessNo: string | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  offerPrice: number | null;
  listingOpenPrice: number | null;
  listingOpenReturnRate: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
  generalSubscriptionCompetitionRate: number | null;
  irStart: Date | null;
  irEnd: Date | null;
  demandForecastStart: Date | null;
  demandForecastEnd: Date | null;
  tradableShares: number | null;
  floatRatio: number | null;
  subscriptionStart: Date;
  subscriptionEnd: Date;
  refundDate: Date | null;
  listingDate: Date | null;
  status: IpoStatus;
  events: IpoEventRecord[];
  latestAnalysis: IpoAnalysisRecord;
  publicScore: PublicIpoScoreRecord | null;
  latestSourceKey: string;
  sourceFetchedAt: Date;
};

export type PublicHomeIpoSummary = {
  id: string;
  slug: string;
  name: string;
  market: string;
  leadManager: string;
  subscriptionStart: Date;
  subscriptionEnd: Date;
  offerPrice: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
  listingOpenPrice: number | null;
  listingOpenReturnRate: number | null;
  events: IpoEventRecord[];
  publicScore: {
    totalScore: number | null;
    status: PublicIpoScoreRecord["status"];
    coverageStatus: PublicIpoScoreRecord["coverageStatus"];
  } | null;
};

export type RecipientChannelRecord = {
  id: string;
  type: ChannelType;
  address: string;
  isPrimary: boolean;
  isVerified: boolean;
};

export type RecipientRecord = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  inviteState: "INTERNAL" | "INVITED" | "ACCEPTED" | "REVOKED";
  consentedAt: Date | null;
  unsubscribedAt: Date | null;
  channels: RecipientChannelRecord[];
};

export type NotificationMessage = {
  subject: string;
  tags: string[];
  intro: string;
  webUrl: string | null;
  sections: { label: string; lines: string[] }[];
  footer: string[];
};

export type NotificationJobRecord = {
  id: string;
  ipoId: string;
  ipoSlug: string;
  alertType: AlertType;
  scheduledFor: Date;
  payload: NotificationMessage;
  status: JobStatus;
  idempotencyKey: string;
};

export type NotificationDeliveryRecord = {
  id: string;
  jobId: string;
  recipientId: string;
  channelType: ChannelType;
  channelAddress: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  sentAt: Date | null;
  idempotencyKey: string;
};

export type AdminOverrideRecord = {
  id: string;
  slug: string | null;
  type: string;
  payload: Record<string, unknown>;
  isActive: boolean;
  note: string | null;
};

export type OperationLogRecord = {
  id: string;
  level: OperationLogLevel;
  source: string;
  action: string;
  message: string;
  context: Record<string, unknown> | null;
  createdAt: Date;
};

export type SchedulerStatusRecord = {
  id: string;
  label: string;
  status: SchedulerHealthStatus;
  statusLabel: string;
  expectedAt: Date;
  expectedAtLabel: string;
  lastCompletedAt: Date | null;
  lastCompletedAtLabel: string | null;
  detail: string;
};

export type AdminIpoScoreRecord = {
  legacyIpoId: string;
  slug: string;
  name: string;
  scoreVersion: string | null;
  status: "NOT_READY" | "PARTIAL" | "READY" | "STALE" | "UNAVAILABLE";
  coverageStatus: "EMPTY" | "PARTIAL" | "SUFFICIENT" | "UNAVAILABLE";
  totalScore: number | null;
  supplyScore: number | null;
  lockupScore: number | null;
  competitionScore: number | null;
  marketScore: number | null;
  financialAdjustmentScore: number | null;
  warnings: string[];
  explanations: string[];
  calculatedAt: Date | null;
  queueStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | null;
  queueReason: "DAILY_AUDIT" | "SOURCE_REFRESH" | "MANUAL" | null;
  queueAttempts: number;
};

export type DashboardSnapshot = {
  mode: "database" | "fallback";
  generatedAt: Date;
  calendarMonth: Date;
  ipos: IpoRecord[];
  recipients: RecipientRecord[];
  jobs: NotificationJobRecord[];
  deliveries: NotificationDeliveryRecord[];
  overrides: AdminOverrideRecord[];
  operationLogs: OperationLogRecord[];
  schedulerStatuses: SchedulerStatusRecord[];
  ipoScoreSummaries: AdminIpoScoreRecord[];
};

export type PublicHomeSnapshot = {
  mode: "database" | "fallback";
  generatedAt: Date;
  calendarMonth: Date;
  ipos: PublicHomeIpoSummary[];
};

export type AdminStatusSummary = {
  mode: "database" | "fallback";
  generatedAt: string;
  ipoCount: number;
  recipientCount: number;
  jobCount: number;
  deliveryCount: number;
  errorCount: number;
  warnCount: number;
};

export type PublicIpoDetailRecord = Omit<IpoRecord, "latestSourceKey" | "sourceFetchedAt">;

export type IpoAdminMetadata = {
  latestSourceKey: string;
  sourceFetchedAt: Date;
};

export type SyncResult = {
  mode: "database" | "fallback";
  synced: number;
  ipos: IpoRecord[];
  timestamp: Date;
};

export type PreparedAlertsResult = {
  mode: "database" | "fallback";
  timestamp: Date;
  jobs: NotificationJobRecord[];
};

export type DispatchResult = {
  mode: "database" | "fallback";
  timestamp: Date;
  attempted: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  staleSkippedCount: number;
  deliveries: NotificationDeliveryRecord[];
};
