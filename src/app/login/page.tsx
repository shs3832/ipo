import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getAdminAuthMissingEnvKeys,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import { ADMIN_HOME_PATH, type AdminLoginError, normalizeAdminNextPath } from "@/lib/admin-navigation";
import { loginAction } from "@/app/login/actions";
import styles from "@/app/login/page.module.scss";

export const dynamic = "force-dynamic";

const errorMessage = {
  invalid: "비밀번호가 올바르지 않습니다.",
  "not-configured": "관리자 로그인 설정이 완전하지 않습니다. ADMIN_ACCESS_PASSWORD와 ADMIN_SESSION_SECRET을 모두 설정해 주세요.",
} as const;

const formatRetryAfterLabel = (retryAfter: string | undefined) => {
  const seconds = Number.parseInt(retryAfter ?? "", 10);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "잠시";
  }

  if (seconds < 60) {
    return `${seconds}초`;
  }

  return `${Math.ceil(seconds / 60)}분`;
};

const getLoginErrorMessage = (error: AdminLoginError | undefined, retryAfter: string | undefined) => {
  if (error === "rate-limited") {
    return `로그인 시도가 너무 많습니다. ${formatRetryAfterLabel(retryAfter)} 후 다시 시도해 주세요.`;
  }

  return error ? errorMessage[error] : null;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: AdminLoginError; retryAfter?: string }>;
}) {
  if (await isAdminAuthenticated()) {
    redirect(ADMIN_HOME_PATH);
  }

  const params = await searchParams;
  const next = normalizeAdminNextPath(params.next);
  const error = getLoginErrorMessage(params.error, params.retryAfter);
  const missingEnvKeys = getAdminAuthMissingEnvKeys();
  const hasMissingAdminEnv = missingEnvKeys.length > 0;

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
          {hasMissingAdminEnv ? (
            <p className={styles.help}>
              현재 런타임에서 {missingEnvKeys.join(", ")} 값이 비어 있습니다. `.env` 또는 Vercel
              환경변수의 적용 환경(Production / Preview / Development)과 최근 redeploy 여부를 함께 확인해 주세요.
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
