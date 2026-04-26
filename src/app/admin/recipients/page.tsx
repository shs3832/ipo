import Link from "next/link";

import {
  addAdminRecipientEmailAction,
  deleteAdminRecipientEmailAction,
  updateAdminNotificationPreferenceAction,
  updateAdminRecipientEmailAction,
} from "@/app/admin/recipients/actions";
import { WebPushManager } from "@/app/admin/recipients/web-push-manager";
import { getAdminNotificationPreferences, getAdminRecipientEmailChannels } from "@/lib/jobs";
import { ADMIN_HOME_PATH, ADMIN_RECIPIENTS_PATH } from "@/lib/admin-navigation";
import { ensureAdminAuthenticated } from "@/lib/server/admin-surface";
import { getAdminWebPushState } from "@/lib/server/web-push-service";
import styles from "@/app/admin/recipients/page.module.scss";

export const dynamic = "force-dynamic";

const feedbackStatus = new Set(["success", "error"]);

export default async function AdminRecipientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  await ensureAdminAuthenticated(ADMIN_RECIPIENTS_PATH);

  const [params, channels, preferences, webPushState] = await Promise.all([
    searchParams,
    getAdminRecipientEmailChannels(),
    getAdminNotificationPreferences(),
    getAdminWebPushState(),
  ]);
  const status = params.status && feedbackStatus.has(params.status) ? params.status : null;
  const message = typeof params.message === "string" ? params.message : null;
  const canDelete = channels.length > 1;
  const emailPreference = preferences.find((preference) => preference.channelType === "EMAIL");
  const activePreferenceCount = preferences.filter((preference) => preference.isActive).length;

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">Admin Recipients</p>
            <h1 className="page-title">발송 이메일을 등록하고 수정하고 삭제합니다.</h1>
            <p className="page-copy">
              10시 분석 메일과 마감 리마인더가 실제로 전달될 주소 목록을 관리자 전용 화면에서
              관리합니다.
            </p>
            <div className={styles.metaRow}>
              <span className="status-pill">관리자 로그인 필요</span>
              <span className="status-pill status-pill-soft">verified 이메일만 발송</span>
            </div>
          </div>

          <div className={styles.heroAside}>
            <article className={styles.metricCard}>
              <span className={styles.metricLabel}>등록된 발송 이메일</span>
              <strong className={styles.metricValue}>{channels.length}</strong>
              <p className={styles.metricCopy}>
                이메일 채널이 켜져 있으면 등록한 verified 주소가 다음 발송 잡부터 사용됩니다.
              </p>
            </article>

            <div className={styles.actionGroup}>
              <Link className="button-secondary" href={ADMIN_HOME_PATH}>
                관리자 대시보드
              </Link>
            </div>
          </div>
        </section>

        {status && message ? (
          <section
            className={`${styles.feedbackBanner} ${
              status === "success" ? styles.feedbackSuccess : styles.feedbackError
            }`}
          >
            <p>{message}</p>
          </section>
        ) : null}

        <section className={styles.grid}>
          <article className={`${styles.card} ${styles.preferenceCard}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">알림 채널 설정</h2>
              <p className="section-copy">
                10시 분석 알림을 어떤 채널로 보낼지 선택합니다.
              </p>
            </div>

            <div className={styles.preferenceList}>
              {preferences.map((preference) => {
                const canToggle = preference.isAvailable;
                const nextValue = !preference.isActive;

                return (
                  <form
                    action={updateAdminNotificationPreferenceAction}
                    className={`${styles.preferenceRow} ${
                      preference.isActive ? styles.preferenceRowActive : ""
                    }`}
                    key={preference.channelType}
                  >
                    <input name="channelType" type="hidden" value={preference.channelType} />
                    <input name="isActive" type="hidden" value={String(nextValue)} />
                    <div>
                      <div className={styles.preferenceTitleRow}>
                        <strong>{preference.label}</strong>
                        <span
                          className={`${styles.preferenceBadge} ${
                            preference.isActive ? styles.preferenceBadgeOn : ""
                          }`}
                        >
                          {preference.isActive ? "ON" : "OFF"}
                        </span>
                      </div>
                      <p>{preference.description}</p>
                    </div>
                    <button
                      className="button-secondary"
                      disabled={!canToggle}
                      type="submit"
                    >
                      {preference.isActive ? "끄기" : "켜기"}
                    </button>
                  </form>
                );
              })}
            </div>

            {!emailPreference?.isActive ? (
              <p className={styles.preferenceWarning}>
                이메일 채널이 꺼져 있습니다. 앱푸시 발송이 연결되기 전까지는 실제 자동 알림이
                발송되지 않습니다.
              </p>
            ) : null}
            {activePreferenceCount === 0 ? (
              <p className={styles.preferenceWarning}>
                켜진 알림 채널이 없어 다음 dispatch 실행에서 발송 대상이 없습니다.
              </p>
            ) : null}

            <WebPushManager
              initialSubscriptionCount={webPushState.subscriptionCount}
              isConfigured={webPushState.isConfigured}
              publicKey={webPushState.publicKey}
            />
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">새 이메일 등록</h2>
              <p className="section-copy">
                관리자 화면에서 등록한 이메일은 verified 상태로 즉시 발송 대상에 포함됩니다.
              </p>
            </div>

            <form action={addAdminRecipientEmailAction} className={styles.form}>
              <label className={styles.label} htmlFor="new-address">
                발송 이메일
              </label>
              <input
                autoComplete="email"
                className={styles.input}
                id="new-address"
                name="address"
                placeholder="alerts@example.com"
                required
                type="email"
              />
              <p className={styles.helper}>
                중복 주소는 등록되지 않으며, 저장 후 다음 `dispatch-alerts` 실행부터 반영됩니다.
              </p>
              <button className="button-primary" type="submit">
                이메일 등록
              </button>
            </form>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">등록된 이메일 목록</h2>
              <p className="section-copy">각 주소는 인라인으로 수정하거나 삭제할 수 있습니다.</p>
            </div>

            <div className={styles.list}>
              {channels.length ? (
                channels.map((channel) => (
                  <div className={styles.row} key={channel.id}>
                    <div className={styles.rowHead}>
                      <div>
                        <strong>{channel.address}</strong>
                        <p>
                          {channel.isPrimary ? "기본 주소" : "추가 주소"} ·{" "}
                          {channel.isVerified ? "verified" : "pending"}
                        </p>
                      </div>
                      <span className={styles.channelBadge}>
                        {channel.isPrimary ? "기본" : "추가"}
                      </span>
                    </div>

                    <form action={updateAdminRecipientEmailAction} className={styles.inlineForm}>
                      <input name="channelId" type="hidden" value={channel.id} />
                      <label className={styles.label} htmlFor={`address-${channel.id}`}>
                        이메일 수정
                      </label>
                      <div className={styles.inlineActions}>
                        <input
                          autoComplete="email"
                          className={styles.input}
                          defaultValue={channel.address}
                          id={`address-${channel.id}`}
                          name="address"
                          required
                          type="email"
                        />
                        <button className="button-secondary" type="submit">
                          수정
                        </button>
                      </div>
                    </form>

                    <form action={deleteAdminRecipientEmailAction} className={styles.deleteForm}>
                      <input name="channelId" type="hidden" value={channel.id} />
                      <button
                        className={styles.deleteButton}
                        disabled={!canDelete}
                        type="submit"
                      >
                        삭제
                      </button>
                      {!canDelete ? (
                        <p className={styles.deleteHint}>
                          마지막 발송 이메일은 삭제할 수 없습니다. 다른 주소를 먼저 추가하거나 수정해
                          주세요.
                        </p>
                      ) : null}
                    </form>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <strong>아직 등록된 발송 이메일이 없습니다.</strong>
                  <p>첫 발송 이메일을 등록하면 이후 준비/발송 잡에서 바로 사용할 수 있습니다.</p>
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
