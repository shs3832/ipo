import type { DashboardSnapshot, OperationLogRecord } from "@/lib/types";

const buildFallbackLogs = (): OperationLogRecord[] => [
  {
    id: "log-fallback-warning",
    level: "WARN",
    source: "system:fallback",
    action: "empty_state",
    message: "표시할 공모주 실데이터가 없어 빈 상태로 동작 중입니다.",
    context: {
      reason: "missing-live-source-or-database",
    },
    createdAt: new Date(),
  },
];

export const buildFallbackDashboard = (): DashboardSnapshot => ({
  mode: "fallback",
  generatedAt: new Date(),
  calendarMonth: new Date(),
  ipos: [],
  recipients: [],
  jobs: [],
  deliveries: [],
  overrides: [],
  operationLogs: buildFallbackLogs(),
});
