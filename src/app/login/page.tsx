import Link from "next/link";
import { redirect } from "next/navigation";

import { hasAdminPassword, hasAdminSessionSecret, isAdminAuthenticated } from "@/lib/admin-auth";
import { loginAction } from "@/app/login/actions";
import styles from "@/app/login/page.module.scss";

export const dynamic = "force-dynamic";

const errorMessage = {
  invalid: "비밀번호가 올바르지 않습니다.",
  "not-configured": "관리자 로그인 설정이 완전하지 않습니다. ADMIN_ACCESS_PASSWORD와 ADMIN_SESSION_SECRET을 모두 설정해 주세요.",
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: keyof typeof errorMessage }>;
}) {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : "/admin";
  const error = params.error ? errorMessage[params.error] : null;

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.card}>
          <div className={styles.copyBlock}>
            <p className="page-eyebrow">Admin Login</p>
            <h1 className="page-title">관리자 운영 화면은 로그인 후에만 열립니다.</h1>
            <p className="page-copy">
              수집 로그, 수신자 정보, 소스 메타데이터 같은 운영용 정보는 일반 사용자 화면과 분리해
              보호하고 있습니다.
            </p>
            <div className={styles.metaRow}>
              <span className="status-pill">Signed Cookie Session</span>
              <span className="status-pill status-pill-soft">관리자 메타데이터 보호</span>
            </div>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
          {!hasAdminPassword() || !hasAdminSessionSecret() ? (
            <p className={styles.help}>
              `.env` 또는 Vercel 환경변수에 `ADMIN_ACCESS_PASSWORD`와 `ADMIN_SESSION_SECRET`을 모두 설정해 주세요.
            </p>
          ) : null}

          <form action={loginAction} className={styles.form}>
            <input name="next" type="hidden" value={next} />
            <label className={styles.label} htmlFor="password">
              관리자 비밀번호
            </label>
            <input
              autoComplete="current-password"
              className={styles.input}
              id="password"
              name="password"
              placeholder="비밀번호 입력"
              required
              type="password"
            />
            <button className="button-primary" type="submit">
              로그인
            </button>
          </form>

          <div className={styles.footer}>
            <Link className="inline-link" href="/">
              캘린더로 돌아가기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
