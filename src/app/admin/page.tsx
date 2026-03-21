import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDateTime } from "@/lib/date";
import { getDashboardSnapshot, getRecentStatusSummary } from "@/lib/jobs";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { logoutAction } from "@/app/login/actions";
import { AdminLogPanel } from "@/app/admin-log-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/login?next=/admin");
  }

  const [snapshot, summary] = await Promise.all([getDashboardSnapshot(), getRecentStatusSummary()]);

  return (
    <main className="shell">
      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>스케줄러, 수신자, 발송 이력을 한곳에서 확인합니다.</h1>
          <p className="hero-copy">
            개인용 1차 구조이지만 수신자, 채널, 구독 모델은 확장을 염두에 두고 설계되어 있습니다.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button-primary" href="/">
            캘린더 보기
          </Link>
          <form action={logoutAction}>
            <button className="button-secondary" type="submit">
              로그아웃
            </button>
          </form>
          <span className="pill">상태 요약 {summary.mode}</span>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span>생성 시각</span>
          <strong>{summary.generatedAt}</strong>
          <p>마지막 대시보드 집계 기준</p>
        </article>
        <article className="summary-card">
          <span>종목 / 수신자</span>
          <strong>
            {summary.ipoCount} / {summary.recipientCount}
          </strong>
          <p>단일 관리자 기반, 다중 수신자 확장 준비</p>
        </article>
        <article className="summary-card">
          <span>잡 / 발송</span>
          <strong>
            {summary.jobCount} / {summary.deliveryCount}
          </strong>
          <p>10시 분석 잡과 최근 채널 전송 기록</p>
        </article>
        <article className="summary-card">
          <span>경고 / 오류</span>
          <strong>
            {summary.warnCount} / {summary.errorCount}
          </strong>
          <p>최근 운영 로그 기준 주의 및 실패 건수</p>
        </article>
      </section>

      <section className="admin-grid">
        <article className="detail-card">
          <h2>수신자 채널</h2>
          <div className="admin-list">
            {snapshot.recipients.map((recipient) => (
              <div className="admin-row" key={recipient.id}>
                <div>
                  <strong>{recipient.name}</strong>
                  <p>
                    {recipient.status} · {recipient.inviteState}
                  </p>
                </div>
                <ul className="bullet-list">
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

        <article className="detail-card">
          <h2>최근 알림 잡</h2>
          <div className="admin-list">
            {snapshot.jobs.map((job) => (
              <div className="admin-row" key={job.id}>
                <div>
                  <strong>{job.payload.subject}</strong>
                  <p>
                    {job.status} · {formatDateTime(job.scheduledFor)}
                  </p>
                </div>
                <p className="mono-text">{job.idempotencyKey}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="detail-card">
          <h2>최근 발송 이력</h2>
          <div className="admin-list">
            {snapshot.deliveries.map((delivery) => (
              <div className="admin-row" key={delivery.id}>
                <div>
                  <strong>
                    {delivery.channelType} / {delivery.channelAddress}
                  </strong>
                  <p>
                    {delivery.status}
                    {delivery.sentAt ? ` · ${formatDateTime(delivery.sentAt)}` : ""}
                  </p>
                </div>
                <p>{delivery.errorMessage ?? delivery.providerMessageId ?? "정상 발송"}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="detail-card">
          <h2>수동 보정</h2>
          <div className="admin-list">
            {snapshot.overrides.map((override) => (
              <div className="admin-row" key={override.id}>
                <div>
                  <strong>{override.type}</strong>
                  <p>{override.slug ?? "전체 적용"}</p>
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
    </main>
  );
}
