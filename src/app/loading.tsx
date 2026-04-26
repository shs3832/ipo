export default function AppLoading() {
  return (
    <main className="page-shell">
      <section className="app-loading-card">
        <span aria-hidden="true" className="app-loading-spinner" />
        <p className="page-eyebrow">IPO Calendar Alerts</p>
        <h1 className="page-title">요청한 화면으로 이동하고 있습니다.</h1>
        <p className="page-copy">
          푸시 알림에서 연결된 공모주 일정과 알림 상태를 불러오는 중입니다.
        </p>
        <div className="app-loading-bars" aria-hidden="true">
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
