import Link from "next/link";
import { notFound } from "next/navigation";

import { BrokerChipList } from "@/components/broker-chip";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  formatDate,
  formatDateTime,
} from "@/lib/date";
import { getIpoAdminMetadataBySlug } from "@/lib/jobs";
import { getCachedIpoDetail } from "@/lib/page-data";
import { buildIpoDetailViewModel, unavailableLabel } from "@/app/ipos/[slug]/page-helpers";
import styles from "@/app/ipos/[slug]/page.module.scss";

export const dynamic = "force-dynamic";

const renderValue = (value: string | null | undefined, className?: string) =>
  value ? value : <span className={className}>{unavailableLabel}</span>;

const renderNumericValue = (
  value: string | null,
  emphasis = false,
) => (
  value
    ? <span className={emphasis ? styles.primaryValue : undefined}>{value}</span>
    : <span className={styles.unavailableValue}>{unavailableLabel}</span>
);

export default async function IpoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const isAdmin = await isAdminAuthenticated();
  const ipo = await getCachedIpoDetail(slug);

  if (!ipo) {
    notFound();
  }

  const adminMetadata = isAdmin ? await getIpoAdminMetadataBySlug(slug) : null;
  const detailView = buildIpoDetailViewModel(ipo);

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <Link className="inline-link" href="/">
          캘린더로 돌아가기
        </Link>

        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">{ipo.market}</p>
            <h1 className="page-title">{ipo.name}</h1>
            <BrokerChipList className={styles.heroBrokerList} names={[ipo.leadManager, ...ipo.coManagers]} />
            <div className={styles.metaRow}>
              <span className="status-pill">청약 마감 {formatDate(ipo.subscriptionEnd)}</span>
              <span className="status-pill status-pill-soft">데이터 {detailView.dataQualityLabel}</span>
              <span className={`status-pill status-pill-soft ${styles.scoreHidden}`}>{detailView.scoreMetaLabel}</span>
            </div>
          </div>

          <div className={`${styles.scoreCard} ${styles.scoreHidden}`}>
            <span className={styles.scoreLabel}>종합 점수</span>
            {ipo.publicScore?.totalScore != null ? (
              <strong>{ipo.publicScore.totalScore.toFixed(1)}</strong>
            ) : (
              <strong className={styles.scoreValueMuted}>산출 대기</strong>
            )}
            <span className={styles.scoreRating}>{detailView.scoreStatusLabel}</span>
            <div className={styles.scoreReasonBlock}>
              <span className={styles.scoreReasonLabel}>산출 근거</span>
              <ul className={styles.scoreReasonList}>
                {detailView.scoreReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div className={styles.scoreBreakdownGrid}>
              {detailView.scoreBreakdown.map((item) => (
                <div className={styles.scoreBreakdownItem} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value ?? unavailableLabel}</strong>
                </div>
              ))}
            </div>
            <p className={styles.scoreHelpText}>{detailView.scoreHelpText}</p>
            <p className={styles.scoreDisclaimer}>{detailView.scoreDisclaimer}</p>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">지금 판단용</h2>
              <p className="section-copy">청약 결정을 위해 가장 먼저 확인할 항목만 위로 올렸습니다.</p>
            </div>
            <div className={styles.quickGrid}>
              {detailView.quickFacts.map((fact) => (
                <div className={styles.quickItem} key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{renderNumericValue(fact.value, fact.emphasis)}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">공시 기반 체크 포인트</h2>
              <p className="section-copy">공시와 청약 데이터에서 확인된 핵심 근거와 주의 포인트를 함께 정리했습니다.</p>
            </div>
            <p className={styles.analysisSummary}>{detailView.analysisSummary}</p>
            <p className={styles.analysisDisclaimer}>세부 숫자는 아래 항목과 증권신고서 원문을 함께 확인해 주세요.</p>
            <div className={styles.analysisColumns}>
              <div className={styles.analysisBlock}>
                <h3>핵심 근거</h3>
                <ul className={styles.bulletList}>
                  {detailView.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.analysisBlock}>
                <h3>주의 포인트</h3>
                <ul className={styles.bulletList}>
                  {detailView.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">청약 일정</h2>
              <p className="section-copy">핵심 일정은 간단하게, 일정 범위형 데이터는 여기서 확인합니다.</p>
            </div>
            <dl className={styles.statList}>
              {detailView.scheduleFacts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{renderValue(fact.value, styles.unavailableValue)}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">상세 데이터</h2>
              <p className="section-copy">판단에 직접 쓰이지 않는 보조 수치는 아래로 정리했습니다.</p>
            </div>
            <dl className={styles.statList}>
              {detailView.detailFacts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{renderValue(fact.value, styles.unavailableValue)}</dd>
                </div>
              ))}
              {detailView.isListedYet ? detailView.listingFacts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{renderValue(fact.value, styles.unavailableValue)}</dd>
                </div>
              )) : null}
              {isAdmin ? (
                <>
                  <div>
                    <dt>최근 수집 시각</dt>
                    <dd>{adminMetadata ? formatDateTime(adminMetadata.sourceFetchedAt) : "-"}</dd>
                  </div>
                  <div>
                    <dt>소스 키</dt>
                    <dd>{adminMetadata?.latestSourceKey ?? "-"}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </article>
        </section>
      </div>
    </main>
  );
}
