import styles from "@/app/admin/page.module.scss";

export default function AdminLoading() {
  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">Admin Console</p>
            <h1 className="page-title">관리자 화면을 준비하고 있습니다.</h1>
            <p className="page-copy">운영 로그와 배치 상태를 불러오는 동안 구조를 먼저 보여드립니다.</p>
            <div className={styles.loadingInline}>
              <span aria-hidden="true" className={styles.spinner} />
              <span>대시보드 데이터를 동기화하고 있습니다.</span>
            </div>
          </div>

          <div className={styles.heroAside}>
            <article className={styles.heroStatusCard}>
              <span className={styles.cardLabel}>로딩 상태</span>
              <strong className={styles.cardValue}>Preparing</strong>
              <p className={styles.cardCopy}>수신자, 잡, 운영 로그 요약을 차례대로 불러오고 있습니다.</p>
            </article>
          </div>
        </section>

        <section className={styles.summaryGrid} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className={styles.summaryCard} key={index}>
              <span className={styles.cardLabel}>집계 준비 중</span>
              <div className={styles.loadingBar} />
              <div className={styles.loadingBarSoft} />
            </article>
          ))}
        </section>

        <section className={styles.grid} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className={styles.card} key={index}>
              <div className={styles.cardHeader}>
                <div className={styles.loadingBar} />
                <div className={styles.loadingBarSoft} />
              </div>
              <div className={styles.list}>
                {Array.from({ length: 2 }).map((__, rowIndex) => (
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
