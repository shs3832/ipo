import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminAuthenticated, hasAdminPassword } from "@/lib/admin-auth";
import { loginAction } from "@/app/login/actions";

export const dynamic = "force-dynamic";

const errorMessage = {
  invalid: "비밀번호가 올바르지 않습니다.",
  "not-configured": "관리자 비밀번호가 아직 설정되지 않았습니다. 환경변수에 ADMIN_ACCESS_PASSWORD를 추가해 주세요.",
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
    <main className="shell auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Admin Login</p>
        <h1>관리자만 민감한 정보와 운영 화면을 볼 수 있습니다.</h1>
        <p className="hero-copy">
          관리자 콘솔과 수집 로그, 수신자 정보, 소스 키 같은 운영용 정보는 로그인 후에만 노출됩니다.
        </p>

        {error ? <p className="auth-error">{error}</p> : null}
        {!hasAdminPassword() ? (
          <p className="auth-help">`.env` 또는 Vercel 환경변수에 `ADMIN_ACCESS_PASSWORD`를 먼저 설정해 주세요.</p>
        ) : null}

        <form action={loginAction} className="auth-form">
          <input name="next" type="hidden" value={next} />
          <label className="auth-label" htmlFor="password">
            관리자 비밀번호
          </label>
          <input
            autoComplete="current-password"
            className="auth-input"
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

        <Link className="inline-link" href="/">
          캘린더로 돌아가기
        </Link>
      </section>
    </main>
  );
}
