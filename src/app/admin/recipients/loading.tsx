import styles from "@/app/admin/recipients/page.module.scss";

export default function AdminRecipientsLoading() {
  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">Admin Recipients</p>
            <h1 className="page-title">알림 수신 채널을 불러오고 있습니다.</h1>
            <p className="page-copy">
              이메일과 앱푸시 설정, 현재 기기 수신 상태를 확인하는 중입니다.
            </p>
            <div className={styles.loadingInline}>
              <span aria-hidden="true" className={styles.spinner} />
              <span>수신 채널 상태를 동기화하고 있습니다.</span>
            </div>
          </div>

          <div className={styles.heroAside}>
            <article className={styles.metricCard}>
              <span className={styles.metricLabel}>로딩 상태</span>
              <strong className={styles.metricValue}>Checking</strong>
              <p className={styles.metricCopy}>
                verified 이메일과 앱푸시 구독 수를 차례대로 확인하고 있습니다.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.grid} aria-hidden="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <article className={styles.card} key={index}>
              <div className={styles.cardHeader}>
                <div className={styles.loadingBar} />
                <div className={styles.loadingBarSoft} />
              </div>
              <div className={styles.list}>
                {Array.from({ length: 3 }).map((__, rowIndex) => (
                  <div className={styles.row} key={rowIndex}>
                    <div className={styles.loadingBar} />
                    <div className={styles.loadingBarSoft} />
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
