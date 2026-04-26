"use client";

import { useFormStatus } from "react-dom";

import styles from "@/app/admin/recipients/page.module.scss";

type PendingSubmitButtonProps = {
  className?: string;
  disabled?: boolean;
  label: string;
  pendingHint?: string;
  pendingLabel: string;
};

export function PendingSubmitButton({
  className = "button-secondary",
  disabled = false,
  label,
  pendingHint,
  pendingLabel,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        aria-busy={pending}
        className={className}
        disabled={disabled || pending}
        type="submit"
      >
        <span className={styles.buttonInlineLoading}>
          {pending ? <span aria-hidden="true" className={styles.buttonSpinner} /> : null}
          <span>{pending ? pendingLabel : label}</span>
        </span>
      </button>
      {pending && pendingHint ? (
        <p aria-live="polite" className={styles.pendingHint}>
          {pendingHint}
        </p>
      ) : null}
    </>
  );
}
