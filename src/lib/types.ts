export const TIME_ZONE = "Asia/Seoul";

export type IpoStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED" | "WITHDRAWN";
export type IpoEventType = "SUBSCRIPTION" | "REFUND" | "LISTING";
export type ChannelType = "EMAIL" | "TELEGRAM";
export type AlertType = "CLOSING_DAY_ANALYSIS";
export type DeliveryStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";
export type JobStatus = "READY" | "SENT" | "PARTIAL_FAILURE";
export type OperationLogLevel = "INFO" | "WARN" | "ERROR";

export type SourceIpoRecord = {
  sourceKey: string;
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
  tradableShares?: number | null;
  subscriptionStart: string;
  subscriptionEnd: string;
  refundDate?: string | null;
  listingDate?: string | null;
  status?: IpoStatus;
  demandCompetitionRate?: number | null;
  lockupRate?: number | null;
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
  generatedAt: Date;
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
  latestSourceKey: string;
  sourceFetchedAt: Date;
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
};

export type PublicHomeSnapshot = {
  mode: "database" | "fallback";
  generatedAt: Date;
  calendarMonth: Date;
  ipos: IpoRecord[];
  recipientCount: number;
  jobCount: number;
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
  deliveries: NotificationDeliveryRecord[];
};
