"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type NotificationNavigateMessage = {
  type?: string;
  url?: string;
};

const MESSAGE_TYPE = "IPO_NOTIFICATION_NAVIGATE";

const getTargetLabel = (path: string) => {
  if (path.startsWith("/ipos/")) {
    return "공모주 상세 화면";
  }

  if (path.startsWith("/admin/recipients")) {
    return "알림 수신 채널 설정 화면";
  }

  if (path.startsWith("/admin")) {
    return "관리자 화면";
  }

  return "공모주 일정 화면";
};

export function NotificationNavigationBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!targetLabel) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setTargetLabel(null);
    }, 700);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname, targetLabel]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<NotificationNavigateMessage>) => {
      const { type, url } = event.data ?? {};
      if (type !== MESSAGE_TYPE || !url) {
        return;
      }

      const target = new URL(url, window.location.origin);
      if (target.origin !== window.location.origin) {
        return;
      }

      const nextPath = `${target.pathname}${target.search}${target.hash}`;
      setTargetLabel(getTargetLabel(target.pathname));
      router.push(nextPath);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setTargetLabel(null);
      }, 3500);
    };

    navigator.serviceWorker?.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [router]);

  if (!targetLabel) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-label="푸시 알림 이동 상태"
      className="notification-navigation-overlay"
      role="status"
    >
      <div className="notification-navigation-card">
        <span aria-hidden="true" className="notification-navigation-spinner" />
        <div>
          <strong>푸시 알림을 열고 있습니다.</strong>
          <p>{targetLabel}으로 이동 중입니다.</p>
        </div>
      </div>
    </div>
  );
}
