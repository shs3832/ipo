import Link from "next/link";

import {
  addAdminRecipientEmailAction,
  deleteAdminRecipientEmailAction,
  updateAdminNotificationPreferenceAction,
  updateAdminRecipientEmailAction,
} from "@/app/admin/recipients/actions";
import { PendingSubmitButton } from "@/app/admin/recipients/pending-submit-button";
import { WebPushManager } from "@/app/admin/recipients/web-push-manager";
import {
  ensureAdminRecipient,
  getAdminNotificationPreferences,
  getAdminRecipientEmailChannels,
} from "@/lib/jobs";
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

  const [params, adminRecipient] = await Promise.all([
    searchParams,
    ensureAdminRecipient(),
  ]);
  const [channels, preferences, webPushState] = await Promise.all([
    getAdminRecipientEmailChannels(adminRecipient),
    getAdminNotificationPreferences(adminRecipient),
    getAdminWebPushState(adminRecipient),
  ]);
  const status = params.status && feedbackStatus.has(params.status) ? params.status : null;
  const message = typeof params.message === "string" ? params.message : null;
  const canDelete = channels.length > 1;
  const emailPreference = preferences.find((preference) => preference.channelType === "EMAIL");
  const webPushPreference = preferences.find((preference) => preference.channelType === "WEB_PUSH");
  const isEmailDeliveryActive = Boolean(emailPreference?.isActive);
  const isWebPushDeliveryActive = Boolean(
    webPushPreference?.isActive
      && webPushState.isConfigured
      && webPushState.subscriptionCount > 0,
  );
  const notificationStatus = (() => {
    if (!isEmailDeliveryActive && !isWebPushDeliveryActive) {
      return {
        tone: "warning" as const,
        message:
          "현재 받을 채널이 없습니다. 이메일을 켜거나 이 기기에서 앱푸시 구독을 저장한 뒤 앱푸시를 ON으로 바꿔야 다음 10시 자동 알림이 발송됩니다.",
      };
    }

    if (!isEmailDeliveryActive && isWebPushDeliveryActive) {
      return {
        tone: "info" as const,
        message: `현재 앱푸시만 받는 상태입니다. 다음 10시 자동 알림은 저장된 앱푸시 구독 ${webPushState.subscriptionCount}개로 발송되고, 이메일은 보내지 않습니다.`,
      };
    }

    if (isEmailDeliveryActive && isWebPushDeliveryActive) {
      return {
        tone: "info" as const,
        message: `현재 이메일과 앱푸시를 함께 받는 상태입니다. 다음 10시 자동 알림은 verified 이메일과 앱푸시 구독 ${webPushState.subscriptionCount}개로 발송됩니다.`,
      };
    }

    return {
      tone: "info" as const,
      message: "현재 이메일만 받는 상태입니다. 다음 10시 자동 알림은 verified 이메일로 발송되고, 앱푸시는 보내지 않습니다.",
    };
  })();

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">Admin Recipients</p>
            <h1 className="page-title">10시 자동 알림 수신 채널을 관리합니다.</h1>
            <p className="page-copy">
              이메일과 앱푸시 중 어떤 채널로 다음 10시 분석 알림을 받을지 관리자 전용 화면에서
              확인하고 변경합니다.
            </p>
            <div className={styles.metaRow}>
              <span className="status-pill">관리자 로그인 필요</span>
              <span className="status-pill status-pill-soft">이메일 / 앱푸시 채널별 발송</span>
            </div>
          </div>

          <div className={styles.heroAside}>
            <article className={styles.metricCard}>
              <span className={styles.metricLabel}>등록된 발송 이메일</span>
              <strong className={styles.metricValue}>{channels.length}</strong>
              <p className={styles.metricCopy}>
                이메일이 ON이면 verified 주소가 다음 10시 자동 알림 수신 대상으로 사용됩니다.
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
                아래 상태 문구가 실제 다음 10시 자동 알림의 수신 채널입니다.
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
                    <PendingSubmitButton
                      disabled={!canToggle}
                      label={preference.isActive ? "끄기" : "켜기"}
                      pendingLabel={preference.isActive ? "끄는 중..." : "켜는 중..."}
                    />
                  </form>
                );
              })}
            </div>

            <p
              className={
                notificationStatus.tone === "warning"
                  ? styles.preferenceWarning
                  : styles.preferenceInfo
              }
            >
              {notificationStatus.message}
            </p>

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
              <PendingSubmitButton
                className="button-primary"
                label="이메일 등록"
                pendingHint="이메일을 발송 대상에 등록하고 있습니다. 완료되면 화면이 자동으로 갱신됩니다."
                pendingLabel="등록 중..."
              />
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
                        <PendingSubmitButton
                          label="수정"
                          pendingLabel="수정 중..."
                        />
                      </div>
                    </form>

                    <form action={deleteAdminRecipientEmailAction} className={styles.deleteForm}>
                      <input name="channelId" type="hidden" value={channel.id} />
                      <PendingSubmitButton
                        className={styles.deleteButton}
                        disabled={!canDelete}
                        label="삭제"
                        pendingLabel="삭제 중..."
                      />
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
