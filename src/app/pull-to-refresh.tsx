"use client";

import { useEffect, useRef, useState } from "react";

import styles from "@/app/pull-to-refresh.module.scss";

const refreshThreshold = 72;
const maxPullDistance = 96;

const getStatusLabel = (status: "pulling" | "ready" | "refreshing") => {
  if (status === "refreshing") {
    return "새로고침 중...";
  }

  if (status === "ready") {
    return "놓으면 새로고침";
  }

  return "아래로 당겨 새로고침";
};

export function PullToRefresh() {
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const isReloadingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [status, setStatus] = useState<"idle" | "pulling" | "ready" | "refreshing">("idle");

  useEffect(() => {
    const isAtPageTop = () => window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
    const resetPullState = () => {
      startYRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      setStatus("idle");
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isReloadingRef.current || event.touches.length !== 1 || !isAtPageTop()) {
        return;
      }

      startYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (startYRef.current == null || event.touches.length !== 1) {
        return;
      }

      const currentY = event.touches[0]?.clientY;
      if (currentY == null) {
        resetPullState();
        return;
      }

      const deltaY = currentY - startYRef.current;
      if (deltaY <= 0 || !isAtPageTop()) {
        resetPullState();
        return;
      }

      const nextDistance = Math.min(maxPullDistance, Math.round(deltaY * 0.5));
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
      setStatus(nextDistance >= refreshThreshold ? "ready" : "pulling");
    };

    const handleTouchEnd = () => {
      if (pullDistanceRef.current < refreshThreshold) {
        resetPullState();
        return;
      }

      isReloadingRef.current = true;
      setPullDistance(refreshThreshold);
      setStatus("refreshing");
      window.location.reload();
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", resetPullState);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetPullState);
    };
  }, []);

  if (status === "idle") {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={styles.indicator}
      role="status"
      style={{ transform: `translate3d(-50%, ${Math.max(0, pullDistance - 44)}px, 0)` }}
    >
      <span aria-hidden="true" className={styles.spinner} />
      <span>{getStatusLabel(status)}</span>
    </div>
  );
}
