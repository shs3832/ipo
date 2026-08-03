import Link from "next/link";

import {
  getAdminIpoSourceLabel,
  type AdminIpoQualityRecord,
} from "@/lib/admin-ipo-quality";
import { formatDate, formatDateTime } from "@/lib/date";
import { AdminManualSyncForm } from "@/app/admin/manual-sync-form";
import styles from "@/app/admin/page.module.scss";

const qualityToneClassNames = {
  VERIFIED: styles.schedulerBadgeHealthy,
  PARTIAL: styles.schedulerBadgeLate,
  BLOCKED: styles.schedulerBadgeFailed,
} as const;

const freshnessToneClassNames = {
  FRESH: styles.schedulerBadgeHealthy,
  NEEDS_REFRESH: styles.schedulerBadgeLate,
  STALE: styles.schedulerBadgeFailed,
} as const;

const scheduleLabels = {
  TODAY: "오늘 마감",
  UPCOMING: "예정",
  PAST: "지난 종목",
} as const;

const getQualityReason = (record: AdminIpoQualityRecord) => {
  if (!record.isAlertEligible) {
    const missingFacts = [
      ...record.dataQuality.criticalMissing,
      ...record.dataQuality.optionalMissing,
    ];

    return missingFacts.length > 0
      ? `스팩 알림 제외 · 데이터 확인: ${missingFacts.join(", ")}`
      : "스팩 알림 제외 · 데이터 확인 완료";
  }

  if (record.dataQuality.criticalMissing.length > 0) {
    return `필수 누락: ${record.dataQuality.criticalMissing.join(", ")}`;
  }

  if (record.dataQuality.optionalMissing.length > 0) {
    return `추가 확인: ${record.dataQuality.optionalMissing.join(", ")}`;
  }

  return "자동 알림에 필요한 핵심·주요 정보를 확인했습니다.";
};

const IpoQualityRows = ({ records }: { records: AdminIpoQualityRecord[] }) => (
  <ul className={styles.qualityRecordList}>
    {records.map((record) => (
      <li className={styles.qualityRecordRow} key={record.id}>
        <div className={styles.qualityRecordIdentity}>
          <span className="status-pill status-pill-soft">
            {scheduleLabels[record.scheduleStatus]}
          </span>
          <strong>{record.name}</strong>
          <p>
            청약 마감{
              " "
            }
            <time dateTime={record.subscriptionEnd.toISOString()}>
              {formatDate(record.subscriptionEnd)}
            </time>
          </p>
        </div>

        <div className={styles.qualityRecordJudgement}>
          <div className={styles.badgeCluster}>
            {!record.isAlertEligible ? (
              <span className={`${styles.schedulerBadge} ${styles.schedulerBadgePending}`}>
                스팩 제외
              </span>
            ) : null}
            <span
              className={`${styles.schedulerBadge} ${qualityToneClassNames[record.dataQuality.status]}`}
            >
              {record.dataQuality.label}
            </span>
            <span
              className={`${styles.schedulerBadge} ${freshnessToneClassNames[record.sourceFreshness.status]}`}
            >
              {record.sourceFreshness.label}
            </span>
          </div>
          <p>{getQualityReason(record)}</p>
        </div>

        <div className={styles.qualityRecordSource}>
          <span className={styles.qualityRecordLabel}>최근 수집</span>
          <strong title={record.latestSourceKey}>{getAdminIpoSourceLabel(record.latestSourceKey)}</strong>
          <time dateTime={record.sourceFetchedAt.toISOString()}>
            {formatDateTime(record.sourceFetchedAt)}
          </time>
        </div>

        <Link
          className="inline-link"
          href={`/ipos/${record.slug}`}
          prefetch={false}
        >
          공개 상세
        </Link>
      </li>
    ))}
  </ul>
);

export function AdminIpoQualityList({
  records,
  syncAction,
}: {
  records: AdminIpoQualityRecord[];
  syncAction: () => void | Promise<void>;
}) {
  const activeRecords = records.filter((record) => record.scheduleStatus !== "PAST");
  const pastRecords = records.filter((record) => record.scheduleStatus === "PAST");
  const attentionCount = activeRecords.filter(
    (record) => record.isAlertEligible
      && (record.dataQuality.status !== "VERIFIED" || record.sourceFreshness.status !== "FRESH"),
  ).length;

  return (
    <section aria-labelledby="ipo-quality-list-title" className={styles.qualityListCard}>
      <div className={styles.qualityListHeader}>
        <div className={styles.cardHeader}>
          <h2 className="section-title" id="ipo-quality-list-title">
            종목별 데이터 확인
          </h2>
          <p className="section-copy">
            오늘과 예정 종목의 알림 가능 여부, 누락 정보, 최근 수집 상태를 종목별로 확인합니다.
          </p>
        </div>
        <div className={styles.qualityListControls}>
          <span className="status-pill status-pill-soft">
            진행 {activeRecords.length} · 확인 필요 {attentionCount}
          </span>
          <AdminManualSyncForm action={syncAction} />
          <p className={styles.qualitySyncScope}>
            전체 종목을 다시 수집한 뒤 이 목록을 재판정합니다.
          </p>
        </div>
      </div>

      {activeRecords.length > 0 ? (
        <IpoQualityRows records={activeRecords} />
      ) : (
        <div className={styles.qualityListEmpty}>
          <strong>확인할 진행 종목이 없습니다.</strong>
          <p>오늘 또는 앞으로 청약이 마감되는 종목이 수집되면 이 목록에 표시됩니다.</p>
        </div>
      )}

      {pastRecords.length > 0 ? (
        <details className={styles.pastQualityDetails}>
          <summary>지난 종목 {pastRecords.length}건 보기</summary>
          <IpoQualityRows records={pastRecords} />
        </details>
      ) : null}
    </section>
  );
}
