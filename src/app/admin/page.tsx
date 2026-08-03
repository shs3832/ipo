import Link from "next/link";

import { buildAdminIpoQualityOverview } from "@/lib/admin-ipo-quality";
import { formatDateTime } from "@/lib/date";
import { buildAdminStatusSummary, getDashboardSnapshot } from "@/lib/jobs";
import { triggerManualSyncAction } from "@/app/admin/actions";
import { AdminIpoQualityList } from "@/app/admin/ipo-quality-list";
import { logoutAction } from "@/app/login/actions";
import { AdminLogPanel } from "@/app/admin-log-panel";
import { ADMIN_HOME_PATH, ADMIN_RECIPIENTS_PATH } from "@/lib/admin-navigation";
import { ensureAdminAuthenticated } from "@/lib/server/admin-surface";
import styles from "@/app/admin/page.module.scss";

export const dynamic = "force-dynamic";

const getDeliveryTimestampLabel = (delivery: { status: string; sentAt: Date | null; createdAt: Date }) => {
  if (delivery.sentAt) {
    return `발송 ${formatDateTime(delivery.sentAt)}`;
  }

  return delivery.status === "FAILED"
    ? `실패 ${formatDateTime(delivery.createdAt)}`
    : `기록 ${formatDateTime(delivery.createdAt)}`;
};

const syncMessage = {
  success: (synced: string | undefined) =>
    `최신 공모주 데이터를 수동으로 다시 가져왔습니다.${synced ? ` 반영 건수 ${synced}건.` : ""}`,
  error: "최신 공모주 데이터를 가져오지 못했습니다. 운영 로그와 Vercel 함수 로그를 확인해 주세요.",
} as const;

const schedulerToneClassNames = {
  HEALTHY: styles.schedulerBadgeHealthy,
  PENDING: styles.schedulerBadgePending,
  LATE: styles.schedulerBadgeLate,
  MISSED: styles.schedulerBadgeMissed,
  FAILED: styles.schedulerBadgeFailed,
} as const;

const scoreStatusToneClassNames = {
  READY: styles.scoreBadgeReady,
  PARTIAL: styles.scoreBadgePartial,
  NOT_READY: styles.scoreBadgeMissing,
  STALE: styles.scoreBadgeMissing,
  UNAVAILABLE: styles.scoreBadgeMissing,
} as const;

const coverageToneClassNames = {
  SUFFICIENT: styles.coverageBadgeSufficient,
  PARTIAL: styles.coverageBadgePartial,
  EMPTY: styles.coverageBadgeEmpty,
  UNAVAILABLE: styles.coverageBadgeEmpty,
} as const;

const schedulerStatusPriority = {
  FAILED: 0,
  MISSED: 1,
  LATE: 2,
  PENDING: 3,
  HEALTHY: 4,
} as const;

const formatScoreValue = (value: number | null) => (value == null ? "-" : value.toFixed(1));

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: keyof typeof syncMessage; synced?: string }>;
}) {
  await ensureAdminAuthenticated(ADMIN_HOME_PATH);

  const params = await searchParams;
  const snapshot = await getDashboardSnapshot();
  const summary = buildAdminStatusSummary(snapshot);
  const ipoQualityOverview = buildAdminIpoQualityOverview(snapshot.ipos);
  const refreshAttentionCount = ipoQualityOverview.counts.needsRefresh + ipoQualityOverview.counts.stale;
  const closingTodayRefreshAttentionCount = ipoQualityOverview.records.filter(
    (record) => record.isClosingToday
      && record.isAlertEligible
      && record.sourceFreshness.status !== "FRESH",
  ).length;
  const closingTodayEligibleCount = ipoQualityOverview.counts.closingToday
    - ipoQualityOverview.counts.excludedSpacClosingToday;
  const syncStatus = params.sync && params.sync in syncMessage ? params.sync : null;
  const syncFeedback = syncStatus
    ? (typeof syncMessage[syncStatus] === "function"
        ? syncMessage[syncStatus](params.synced)
        : syncMessage[syncStatus])
    : null;
  const schedulerStatuses = [...snapshot.schedulerStatuses].sort(
    (left, right) => schedulerStatusPriority[left.status] - schedulerStatusPriority[right.status],
  );
  const attentionSchedulerCount = schedulerStatuses.filter(
    (status) => status.status === "FAILED" || status.status === "MISSED" || status.status === "LATE",
  ).length;
  const healthLabel = summary.errorCount > 0
    ? "오류 확인 필요"
    : summary.warnCount > 0 || attentionSchedulerCount > 0
      ? "주의 항목 확인"
      : "정상 운영 중";
  const healthToneClassName = summary.errorCount > 0
    ? styles.healthCritical
    : summary.warnCount > 0 || attentionSchedulerCount > 0
      ? styles.healthWarning
      : styles.healthHealthy;
  const qualityHeadline = ipoQualityOverview.counts.total === 0
    ? "집계할 공모주가 없습니다"
    : ipoQualityOverview.counts.closingToday === 0
      ? "오늘 마감 종목이 없습니다"
      : ipoQualityOverview.counts.blockedClosingToday > 0
        ? `오늘 마감 ${ipoQualityOverview.counts.closingToday}건 중 ${ipoQualityOverview.counts.blockedClosingToday}건 발송 보류`
        : closingTodayRefreshAttentionCount > 0
          ? `오늘 마감 ${ipoQualityOverview.counts.closingToday}건 중 ${closingTodayRefreshAttentionCount}건 갱신 확인 필요`
          : closingTodayEligibleCount === 0
            ? `오늘 마감 ${ipoQualityOverview.counts.closingToday}건은 스팩으로 알림 제외`
            : `오늘 마감 ${ipoQualityOverview.counts.closingToday}건 중 알림 대상 ${closingTodayEligibleCount}건 핵심 정보 확인`;
  const qualityToneClassName = ipoQualityOverview.counts.total === 0
    ? styles.qualityOverviewNeutral
    : ipoQualityOverview.counts.blockedClosingToday > 0 || ipoQualityOverview.counts.stale > 0
      ? styles.qualityOverviewCritical
      : ipoQualityOverview.counts.blocked > 0
        || ipoQualityOverview.counts.partial > 0
        || refreshAttentionCount > 0
        ? styles.qualityOverviewWarning
        : styles.qualityOverviewHealthy;

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">Admin Console</p>
            <h1 className="page-title">운영 상태를 먼저 확인하세요.</h1>
            <p className="page-copy">
              일정 동기화, 알림 준비와 발송 상태에서 확인이 필요한 항목을 먼저 보여줍니다.
            </p>
            <div className={styles.heroMetaRow}>
              <span className="status-pill">상태 요약 {summary.mode}</span>
              <span className="status-pill status-pill-soft">최근 집계 {summary.generatedAt}</span>
            </div>
          </div>

          <div className={styles.heroAside}>
            <article className={`${styles.heroStatusCard} ${healthToneClassName}`}>
              <span className={styles.healthLabel}>현재 운영 상태</span>
              <strong className={styles.healthValue}>{healthLabel}</strong>
              <div className={styles.healthCounts}>
                <span>오류 {summary.errorCount}</span>
                <span>경고 {summary.warnCount}</span>
                <span>스케줄 {attentionSchedulerCount}</span>
              </div>
            </article>
            <div className={styles.actionGroup}>
              <Link className="button-secondary" href={ADMIN_RECIPIENTS_PATH}>
                이메일 관리
              </Link>
              <Link className="button-secondary" href="/">
                캘린더 보기
              </Link>
              <form action={logoutAction} className={styles.logoutForm}>
                <button className="button-secondary" type="submit">
                  로그아웃
                </button>
              </form>
            </div>
          </div>
        </section>

        {syncFeedback ? (
          <section
            className={`${styles.feedbackBanner} ${
              syncStatus === "success" ? styles.feedbackSuccess : styles.feedbackError
            }`}
          >
            <p>{syncFeedback}</p>
          </section>
        ) : null}

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>최근 집계</span>
            <strong className={styles.summaryValue}>{summary.generatedAt}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>종목 / 수신자</span>
            <strong className={styles.summaryValue}>
              {summary.ipoCount} / {summary.recipientCount}
            </strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>잡 / 발송</span>
            <strong className={styles.summaryValue}>
              {summary.jobCount} / {summary.deliveryCount}
            </strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>운영 모드</span>
            <strong className={styles.summaryValue}>{summary.mode}</strong>
          </article>
        </section>

        <section
          aria-labelledby="ipo-data-quality-title"
          className={`${styles.qualityOverview} ${qualityToneClassName}`}
        >
          <div className={styles.qualityHeader}>
            <div className={styles.qualityIntro}>
              <p className="page-eyebrow">Data Readiness</p>
              <h2 className="section-title" id="ipo-data-quality-title">
                공모주 데이터 품질
              </h2>
              <p className="section-copy">
                자동 알림에 필요한 핵심 정보와 최근 06:00 동기화 주기 이후의 데이터 갱신 상태를
                함께 집계합니다.
              </p>
            </div>

            <div className={styles.qualityTodayStatus}>
              <span className={styles.qualityTodayLabel}>오늘 마감 상태</span>
              <strong>{qualityHeadline}</strong>
              {ipoQualityOverview.counts.closingToday > 0 ? (
                <p>
                  핵심 정보 기준 발송 가능 {ipoQualityOverview.counts.sendableClosingToday}건 · 발송 보류{
                    " "
                  }{ipoQualityOverview.counts.blockedClosingToday}건
                  {closingTodayRefreshAttentionCount > 0
                    ? ` · 갱신 확인 ${closingTodayRefreshAttentionCount}건`
                    : ""}
                  {ipoQualityOverview.counts.excludedSpacClosingToday > 0
                    ? ` · 스팩 제외 ${ipoQualityOverview.counts.excludedSpacClosingToday}건`
                    : ""}
                </p>
              ) : (
                <p>오늘은 마감 알림 대상 여부를 확인할 종목이 없습니다.</p>
              )}
            </div>
          </div>

          <dl className={styles.qualityMetricGrid}>
            <div className={styles.qualityMetric}>
              <dt>진행 종목</dt>
              <dd className={styles.qualityMetricValue}>{ipoQualityOverview.counts.active}</dd>
              <dd className={styles.qualityMetricDescription}>
                알림 대상 {ipoQualityOverview.counts.eligible} · 지난 종목{
                  " "
                }{ipoQualityOverview.counts.total - ipoQualityOverview.counts.active}건 제외
              </dd>
            </div>
            <div className={`${styles.qualityMetric} ${styles.qualityMetricVerified}`}>
              <dt>검증 완료</dt>
              <dd className={styles.qualityMetricValue}>{ipoQualityOverview.counts.verified}</dd>
              <dd className={styles.qualityMetricDescription}>핵심·주요 정보 확인</dd>
            </div>
            <div className={`${styles.qualityMetric} ${styles.qualityMetricPartial}`}>
              <dt>일부 미확인</dt>
              <dd className={styles.qualityMetricValue}>{ipoQualityOverview.counts.partial}</dd>
              <dd className={styles.qualityMetricDescription}>핵심 정보 충족 · 추가 확인</dd>
            </div>
            <div className={`${styles.qualityMetric} ${styles.qualityMetricBlocked}`}>
              <dt>발송 보류</dt>
              <dd className={styles.qualityMetricValue}>{ipoQualityOverview.counts.blocked}</dd>
              <dd className={styles.qualityMetricDescription}>핵심 정보 누락</dd>
            </div>
            <div className={`${styles.qualityMetric} ${styles.qualityMetricExcluded}`}>
              <dt>스팩 제외</dt>
              <dd className={styles.qualityMetricValue}>{ipoQualityOverview.counts.excludedSpac}</dd>
              <dd className={styles.qualityMetricDescription}>자동 알림 대상 제외</dd>
            </div>
            <div className={`${styles.qualityMetric} ${styles.qualityMetricRefresh}`}>
              <dt>갱신 확인</dt>
              <dd className={styles.qualityMetricValue}>{refreshAttentionCount}</dd>
              <dd className={styles.qualityMetricDescription}>
                갱신 필요 {ipoQualityOverview.counts.needsRefresh} · 오래됨{
                  " "
                }{ipoQualityOverview.counts.stale}
              </dd>
            </div>
          </dl>
        </section>

        <AdminIpoQualityList
          records={ipoQualityOverview.records}
          syncAction={triggerManualSyncAction}
        />

        <section className={styles.grid}>
          <article className={`${styles.card} ${styles.cardPriority}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">일일 업데이트 검증</h2>
              <p className="section-copy">
                Vercel Cron UTC 스케줄을 KST로 환산해 06:00 동기화와 09:30 준비/10:00 분석 알림 실행
                여부를 검증합니다.
              </p>
            </div>
            <div className={styles.list}>
              {schedulerStatuses.length ? (
                schedulerStatuses.map((status) => (
                  <div className={styles.row} key={status.id}>
                    <div className={styles.rowHead}>
                      <div>
                        <strong>{status.label}</strong>
                        <p>
                          예정 {status.expectedAtLabel}
                          {status.lastCompletedAtLabel ? ` · 최근 성공 ${status.lastCompletedAtLabel}` : ""}
                        </p>
                      </div>
                      <span
                        className={`${styles.schedulerBadge} ${schedulerToneClassNames[status.status]}`}
                      >
                        {status.statusLabel}
                      </span>
                    </div>
                    <p>{status.detail}</p>
                  </div>
                ))
              ) : (
                <div className={styles.row}>
                  <p>DB fallback 상태에서는 일일 스케줄 검증 이력을 집계하지 않습니다.</p>
                </div>
              )}
            </div>
          </article>

          <article className={`${styles.card} ${styles.scoreHidden}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">V2 점수 상태</h2>
              <p className="section-copy">
                유통, 확약, 경쟁, 재무 보정 기반의 V2 점수 적재 상태와 재계산 큐 상태를 함께 확인합니다.
              </p>
            </div>
            <div className={styles.list}>
              {snapshot.ipoScoreSummaries.length ? (
                snapshot.ipoScoreSummaries.map((score) => (
                  <div className={styles.row} key={score.legacyIpoId}>
                    <div className={styles.rowHead}>
                      <div>
                        <strong>{score.name}</strong>
                        <p>
                          총점 {formatScoreValue(score.totalScore)}
                          {score.calculatedAt ? ` · 계산 ${formatDateTime(score.calculatedAt)}` : " · 아직 계산 전"}
                        </p>
                      </div>
                      <div className={styles.badgeCluster}>
                        <span
                          className={`${styles.schedulerBadge} ${scoreStatusToneClassNames[score.status]}`}
                        >
                          {score.status}
                        </span>
                        <span
                          className={`${styles.schedulerBadge} ${coverageToneClassNames[score.coverageStatus]}`}
                        >
                          {score.coverageStatus}
                        </span>
                      </div>
                    </div>
                    <p>
                      유통 {formatScoreValue(score.supplyScore)} / 확약 {formatScoreValue(score.lockupScore)} /
                      경쟁 {formatScoreValue(score.competitionScore)} / 재무보정 {formatScoreValue(score.financialAdjustmentScore)}
                    </p>
                    <p>
                      큐 {score.queueStatus ?? "-"}
                      {score.queueReason ? ` · ${score.queueReason}` : ""}
                      {score.queueAttempts ? ` · 시도 ${score.queueAttempts}` : ""}
                    </p>
                    {score.explanations.length ? (
                      <ul className={styles.bulletList}>
                        {score.explanations.slice(0, 2).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {score.warnings.length ? (
                      <ul className={styles.bulletList}>
                        {score.warnings.slice(0, 2).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className={styles.row}>
                  <p>점수 스냅샷이 아직 없습니다. 마이그레이션 적용 후 `daily-sync`를 다시 실행해 주세요.</p>
                </div>
              )}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">수신자 채널</h2>
              <p className="section-copy">활성 수신자와 인증 상태를 함께 확인합니다.</p>
            </div>
            <div className={styles.list}>
              {snapshot.recipients.map((recipient) => (
                <div className={styles.row} key={recipient.id}>
                  <div className={styles.rowHead}>
                    <div>
                      <strong>{recipient.name}</strong>
                      <p>
                        {recipient.status} · {recipient.inviteState}
                      </p>
                    </div>
                  </div>
                  <ul className={styles.bulletList}>
                    {recipient.channels.map((channel) => (
                      <li key={channel.id}>
                        {channel.type} / {channel.address} / {channel.isVerified ? "verified" : "pending"}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">최근 알림 잡</h2>
              <p className="section-copy">잡 상태와 idempotency 키를 함께 확인합니다.</p>
            </div>
            <div className={styles.list}>
              {snapshot.jobs.map((job) => (
                <div className={styles.row} key={job.id}>
                  <div className={styles.rowHead}>
                    <div>
                      <strong>{job.payload.subject}</strong>
                      <p>
                        {job.status} · {formatDateTime(job.scheduledFor)}
                      </p>
                    </div>
                  </div>
                  <p className="mono-text">{job.idempotencyKey}</p>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">최근 발송 이력</h2>
              <p className="section-copy">채널별 전송 상태와 오류 메시지를 확인합니다.</p>
            </div>
            <div className={styles.list}>
              {snapshot.deliveries.map((delivery) => (
                <div className={styles.row} key={delivery.id}>
                  <div className={styles.rowHead}>
                    <div>
                      <strong>
                        {delivery.channelType} / {delivery.channelAddress}
                      </strong>
                      <p>
                        {delivery.status}
                        {` · ${getDeliveryTimestampLabel(delivery)}`}
                      </p>
                    </div>
                  </div>
                  <p>{delivery.errorMessage ?? delivery.providerMessageId ?? "정상 발송"}</p>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">수동 보정</h2>
              <p className="section-copy">운영 중 적용된 보정값을 기록 단위로 확인합니다.</p>
            </div>
            <div className={styles.list}>
              {snapshot.overrides.map((override) => (
                <div className={styles.row} key={override.id}>
                  <div className={styles.rowHead}>
                    <div>
                      <strong>{override.type}</strong>
                      <p>{override.slug ?? "전체 적용"}</p>
                    </div>
                  </div>
                  <p>{override.note ?? JSON.stringify(override.payload)}</p>
                </div>
              ))}
            </div>
          </article>

          <AdminLogPanel
            logs={snapshot.operationLogs.map((log) => ({
              id: log.id,
              level: log.level,
              source: log.source,
              action: log.action,
              message: log.message,
              context: log.context,
              createdAtLabel: formatDateTime(log.createdAt),
            }))}
          />
        </section>
      </div>
    </main>
  );
}
