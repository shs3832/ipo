"use client";

import { useFormStatus } from "react-dom";

import styles from "@/app/admin/page.module.scss";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        aria-busy={pending}
        className="button-primary"
        disabled={pending}
        type="submit"
      >
        <span className={styles.buttonInlineLoading}>
          {pending ? <span aria-hidden="true" className={styles.buttonSpinner} /> : null}
          <span>{pending ? "최신 데이터 가져오는 중..." : "최신 데이터 가져오기"}</span>
        </span>
      </button>
      {pending ? (
        <p className={styles.syncPendingHint}>
          공모주 최신 데이터를 다시 수집하고 있습니다. 완료되면 관리자 화면이 자동으로 갱신됩니다.
        </p>
      ) : null}
    </>
  );
}

export function AdminManualSyncForm({
  action,
}: {
  action: () => void | Promise<void>;
}) {
  return (
    <form action={action} className={styles.syncForm}>
      <SubmitButton />
    </form>
  );
}
