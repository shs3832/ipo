import { logOperation, toErrorContext } from "@/lib/ops-log";

export const loadOptionalIpoSource = async <T>(
  source: string,
  loader: () => Promise<T>,
  onFailure = async (error: unknown) => logOperation({
    level: "WARN",
    source: "job:daily-sync",
    action: "optional_source_failed",
    message: `${source} 보강에 실패해 정상 수집한 다른 출처 데이터로 계속합니다.`,
    context: toErrorContext(error, { failedSource: source }),
  }),
): Promise<{ value: T | null; failed: boolean }> => {
  try {
    return { value: await loader(), failed: false };
  } catch (error) {
    await onFailure(error);
    return { value: null, failed: true };
  }
};

export const shouldWithdrawMissingIpo = ({
  explicitlyExcluded,
  sourceCoverageComplete,
  recentlySeen,
}: {
  explicitlyExcluded: boolean;
  sourceCoverageComplete: boolean;
  recentlySeen: boolean;
}) => explicitlyExcluded || (sourceCoverageComplete && !recentlySeen);
