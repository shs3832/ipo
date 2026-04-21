import Link from "next/link";

import { formatDateTime } from "@/lib/date";
import { buildAdminStatusSummary, getDashboardSnapshot } from "@/lib/jobs";
import { triggerManualSyncAction } from "@/app/admin/actions";
import { AdminManualSyncForm } from "@/app/admin/manual-sync-form";
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
  const syncStatus = params.sync && params.sync in syncMessage ? params.sync : null;
  const syncFeedback = syncStatus
    ? (typeof syncMessage[syncStatus] === "function"
        ? syncMessage[syncStatus](params.synced)
        : syncMessage[syncStatus])
    : null;

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">Admin Console</p>
            <h1 className="page-title">스케줄러, 수신자, 발송 이력을 한곳에서 추적합니다.</h1>
            <p className="page-copy">
              운영 로그와 배치 상태를 한 화면에서 확인할 수 있게 정리해, 일정 정확도와 알림 중복
              여부를 빠르게 점검할 수 있도록 구성했습니다.
            </p>
            <div className={styles.heroMetaRow}>
              <span className="status-pill">상태 요약 {summary.mode}</span>
              <span className="status-pill status-pill-soft">최근 집계 {summary.generatedAt}</span>
            </div>
          </div>

          <div className={styles.heroAside}>
            <article className={styles.heroStatusCard}>
              <span className={styles.cardLabel}>최근 경고 / 오류</span>
              <strong className={styles.cardValue}>
                {summary.warnCount} / {summary.errorCount}
              </strong>
              <p className={styles.cardCopy}>운영 로그 기준으로 즉시 확인이 필요한 신호를 요약했습니다.</p>
            </article>
            <div className={styles.actionGroup}>
              <AdminManualSyncForm action={triggerManualSyncAction} />
              <Link className="button-secondary" href={ADMIN_RECIPIENTS_PATH}>
                이메일 관리
              </Link>
              <Link className="button-primary" href="/">
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
            <span className={styles.cardLabel}>생성 시각</span>
            <strong className={styles.summaryValue}>{summary.generatedAt}</strong>
            <p className={styles.cardCopy}>마지막 대시보드 집계 기준입니다.</p>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>종목 / 수신자</span>
            <strong className={styles.summaryValue}>
              {summary.ipoCount} / {summary.recipientCount}
            </strong>
            <p className={styles.cardCopy}>단일 관리자 기반에서 다중 수신자로 확장할 수 있는 구조입니다.</p>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>잡 / 발송</span>
            <strong className={styles.summaryValue}>
              {summary.jobCount} / {summary.deliveryCount}
            </strong>
            <p className={styles.cardCopy}>현재 운영 중인 10시 분석 메일 기준 최근 작업 기록입니다.</p>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>운영 모드</span>
            <strong className={styles.summaryValue}>{summary.mode}</strong>
            <p className={styles.cardCopy}>실시간 DB 상태를 기준으로 현재 콘솔 컨텍스트를 보여줍니다.</p>
          </article>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">일일 업데이트 검증</h2>
              <p className="section-copy">
                Vercel Cron UTC 스케줄을 KST로 환산해 06:00 동기화와 09:55/10:00 분석 메일 실행
                여부를 검증합니다.
              </p>
            </div>
            <div className={styles.list}>
              {snapshot.schedulerStatuses.length ? (
                snapshot.schedulerStatuses.map((status) => (
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
