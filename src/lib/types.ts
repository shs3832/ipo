export const TIME_ZONE = "Asia/Seoul";

export type IpoStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED" | "WITHDRAWN";
export type IpoEventType = "SUBSCRIPTION" | "REFUND" | "LISTING";
export type ChannelType = "EMAIL" | "TELEGRAM";
export type AlertType = "CLOSING_DAY_ANALYSIS";
export type DeliveryStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";
export type JobStatus = "READY" | "SENT" | "PARTIAL_FAILURE";

export type SourceIpoRecord = {
  sourceKey: string;
  name: string;
  market: string;
  leadManager: string;
  coManagers?: string[];
  priceBandLow?: number | null;
  priceBandHigh?: number | null;
  offerPrice?: number | null;
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
  priceBandLow: number | null;
  priceBandHigh: number | null;
  offerPrice: number | null;
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
  intro: string;
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

export type DashboardSnapshot = {
  mode: "database" | "sample";
  generatedAt: Date;
  calendarMonth: Date;
  ipos: IpoRecord[];
  recipients: RecipientRecord[];
  jobs: NotificationJobRecord[];
  deliveries: NotificationDeliveryRecord[];
  overrides: AdminOverrideRecord[];
};

export type SyncResult = {
  mode: "database" | "sample";
  synced: number;
  ipos: IpoRecord[];
  timestamp: Date;
};

export type PreparedAlertsResult = {
  mode: "database" | "sample";
  timestamp: Date;
  jobs: NotificationJobRecord[];
};

export type DispatchResult = {
  mode: "database" | "sample";
  timestamp: Date;
  attempted: number;
  deliveries: NotificationDeliveryRecord[];
};
