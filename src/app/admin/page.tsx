import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDateTime } from "@/lib/date";
import { getDashboardSnapshot, getRecentStatusSummary } from "@/lib/jobs";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { logoutAction } from "@/app/login/actions";
import { AdminLogPanel } from "@/app/admin-log-panel";
import styles from "@/app/admin/page.module.scss";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/login?next=/admin");
  }

  const [snapshot, summary] = await Promise.all([getDashboardSnapshot(), getRecentStatusSummary()]);

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
            <p className={styles.cardCopy}>오전 10시 분석 잡과 최근 채널 발송 기록입니다.</p>
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
                        {delivery.sentAt ? ` · ${formatDateTime(delivery.sentAt)}` : ""}
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
