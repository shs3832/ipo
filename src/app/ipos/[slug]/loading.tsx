import styles from "@/app/ipos/[slug]/page.module.scss";

export default function IpoDetailLoading() {
  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.loadingHero}>
          <span aria-hidden="true" className={styles.spinner} />
          <p className="page-eyebrow">IPO Detail</p>
          <h1 className="page-title">공모주 상세 정보를 불러오는 중입니다.</h1>
          <p className="page-copy">일정과 분석 요약을 준비하고 있습니다.</p>
        </section>
      </div>
    </main>
  );
}
