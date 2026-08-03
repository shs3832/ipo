import Link from "next/link";
import { notFound } from "next/navigation";

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
  const hasAdditionalCard = detailView.additionalFacts.length > 0 || isAdmin;

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <Link className="inline-link" href="/">
          캘린더로 돌아가기
        </Link>

        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">{detailView.marketLabel}</p>
            <h1 className="page-title">{ipo.name}</h1>
            <div className={styles.metaRow}>
              <span className="status-pill">청약 마감 {formatDate(ipo.subscriptionEnd)}</span>
              {detailView.hasCoreDataGap ? (
                <span className="status-pill status-pill-soft">핵심 정보 {detailView.dataQualityLabel}</span>
              ) : null}
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
              <h2 className="section-title">핵심 정보</h2>
              <p className="section-copy">청약 전에 가장 먼저 확인할 가격과 일정을 모았습니다.</p>
            </div>
            <div className={styles.quickGrid}>
              {detailView.quickFacts.map((fact) => (
                <div
                  className={`${styles.quickItem} ${fact.emphasis ? styles.quickItemEmphasized : ""} ${fact.value ? "" : styles.quickItemUnavailable}`}
                  key={fact.label}
                >
                  <span>{fact.label}</span>
                  <strong>{renderNumericValue(fact.value, fact.emphasis)}</strong>
                </div>
              ))}
            </div>
            <dl className={styles.contextGrid}>
              {detailView.contextFacts.map((fact) => (
                <div className={styles.contextItem} key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className={`${styles.card} ${hasAdditionalCard ? "" : styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">공시 기반 체크 포인트</h2>
              <p className="section-copy">공시와 청약 데이터에서 확인된 핵심 근거와 주의 포인트를 함께 정리했습니다.</p>
            </div>
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
            <p className={styles.analysisDisclaimer}>최종 청약 전 증권신고서와 주관사 공고를 함께 확인해 주세요.</p>
          </article>

          {hasAdditionalCard ? (
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className="section-title">추가 확인 정보</h2>
                <p className="section-copy">확보된 보조 정보만 표시합니다.</p>
              </div>
              <dl className={styles.statList}>
                {detailView.additionalFacts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
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
          ) : null}
        </section>
      </div>
    </main>
  );
}
