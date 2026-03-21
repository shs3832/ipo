import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDate, formatDateTime, formatMoney, formatPercent } from "@/lib/date";
import { getIpoBySlug } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const getMinimumDepositAmount = ({
  offerPrice,
  minimumSubscriptionShares,
  depositRate,
}: {
  offerPrice: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
}) => {
  if (offerPrice == null || minimumSubscriptionShares == null || depositRate == null) {
    return null;
  }

  return Math.round(offerPrice * minimumSubscriptionShares * depositRate);
};

const eventLabel = {
  SUBSCRIPTION: "청약",
  REFUND: "환불",
  LISTING: "상장",
};

export default async function IpoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ipo = await getIpoBySlug(slug);

  if (!ipo) {
    notFound();
  }

  return (
    <main className="shell detail-shell">
      <Link className="inline-link" href="/">
        캘린더로 돌아가기
      </Link>

      <section className="detail-hero">
        <div>
          <p className="eyebrow">{ipo.market}</p>
          <h1>{ipo.name}</h1>
          <p className="hero-copy">
            {ipo.leadManager}
            {ipo.coManagers.length ? ` / 공동주관 ${ipo.coManagers.join(", ")}` : ""}
          </p>
        </div>
        <div className="score-panel">
          <strong>{ipo.latestAnalysis.score}</strong>
          <span>{ipo.latestAnalysis.ratingLabel}</span>
        </div>
      </section>

      <section className="detail-grid">
        <article className="detail-card">
          <h2>핵심 일정</h2>
          <dl className="stat-list">
            <div>
              <dt>청약 시작</dt>
              <dd>{formatDate(ipo.subscriptionStart)}</dd>
            </div>
            <div>
              <dt>청약 마감</dt>
              <dd>{formatDate(ipo.subscriptionEnd)}</dd>
            </div>
            <div>
              <dt>환불일</dt>
              <dd>{ipo.refundDate ? formatDate(ipo.refundDate) : "-"}</dd>
            </div>
            <div>
              <dt>상장 예정일</dt>
              <dd>{ipo.listingDate ? formatDate(ipo.listingDate) : "-"}</dd>
            </div>
          </dl>
        </article>

        <article className="detail-card">
          <h2>가격 정보</h2>
          <dl className="stat-list">
            <div>
              <dt>희망 공모가</dt>
              <dd>
                {formatMoney(ipo.priceBandLow)} ~ {formatMoney(ipo.priceBandHigh)}
              </dd>
            </div>
            <div>
              <dt>확정 공모가</dt>
              <dd>{formatMoney(ipo.offerPrice)}</dd>
            </div>
            <div>
              <dt>최소청약주수</dt>
              <dd>{ipo.minimumSubscriptionShares?.toLocaleString("ko-KR") ?? "-"}주</dd>
            </div>
            <div>
              <dt>최소청약금액</dt>
              <dd>{formatMoney(getMinimumDepositAmount(ipo))}</dd>
            </div>
            <div>
              <dt>증거금률</dt>
              <dd>{formatPercent(ipo.depositRate)}</dd>
            </div>
            <div>
              <dt>최근 수집 시각</dt>
              <dd>{formatDateTime(ipo.sourceFetchedAt)}</dd>
            </div>
            <div>
              <dt>소스 키</dt>
              <dd>{ipo.latestSourceKey}</dd>
            </div>
          </dl>
        </article>

        <article className="detail-card detail-card-wide">
          <h2>분석 요약</h2>
          <p className="analysis-summary">{ipo.latestAnalysis.summary}</p>
          <div className="analysis-columns">
            <div>
              <h3>핵심 근거</h3>
              <ul className="bullet-list">
                {ipo.latestAnalysis.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>주의 포인트</h3>
              <ul className="bullet-list">
                {ipo.latestAnalysis.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>

        <article className="detail-card detail-card-wide">
          <h2>이벤트 타임라인</h2>
          <div className="timeline">
            {ipo.events.map((event) => (
              <div className="timeline-item" key={event.id}>
                <span className="timeline-tag">{eventLabel[event.type]}</span>
                <div>
                  <strong>{event.title}</strong>
                  <p>{formatDate(event.eventDate)}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
