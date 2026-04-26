"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/app/admin/recipients/page.module.scss";

type WebPushManagerProps = {
  publicKey: string;
  isConfigured: boolean;
  initialSubscriptionCount: number;
};

type Feedback = {
  tone: "success" | "error" | "info";
  message: string;
};

type SupportStatus = "checking" | "supported" | "unsupported";

const isIosBrowserTab = () => {
  const userAgent = window.navigator.userAgent;
  const isIosDevice = /iPad|iPhone|iPod/.test(userAgent)
    || (userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return isIosDevice && !isStandalone;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

const serializeSubscription = (subscription: PushSubscription) =>
  JSON.parse(JSON.stringify(subscription));

const requestJson = async (url: string, init: RequestInit = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "요청 처리에 실패했습니다.";
    throw new Error(message);
  }

  if (payload && typeof payload === "object" && "ok" in payload && payload.ok === false) {
    throw new Error("요청은 처리됐지만 성공하지 못했습니다.");
  }

  return payload;
};

export function WebPushManager({
  publicKey,
  isConfigured,
  initialSubscriptionCount,
}: WebPushManagerProps) {
  const router = useRouter();
  const [supportStatus, setSupportStatus] = useState<SupportStatus>("checking");
  const [isSubscribed, setIsSubscribed] = useState(initialSubscriptionCount > 0);
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const isSupported = supportStatus === "supported";

  const canSubscribe = useMemo(
    () => isSupported && isConfigured && Boolean(publicKey) && !isWorking,
    [isConfigured, isSupported, isWorking, publicKey],
  );

  const disabledReason = useMemo(() => {
    if (supportStatus === "checking") {
      return "브라우저 Web Push 지원 여부를 확인하고 있습니다.";
    }

    if (!isSupported) {
      return isIosBrowserTab()
        ? "iPhone/iPad Safari 탭에서는 Web Push를 받을 수 없습니다. 공유 버튼에서 홈 화면에 추가한 뒤, 홈 화면 앱으로 열어 주세요."
        : "이 브라우저는 Web Push를 지원하지 않습니다.";
    }

    if (!isConfigured || !publicKey) {
      return "VAPID 환경변수 설정이 없어 앱푸시 구독을 저장할 수 없습니다.";
    }

    if (isSubscribed) {
      return "현재 브라우저의 Web Push 구독이 저장되어 있습니다.";
    }

    return null;
  }, [isConfigured, isSubscribed, isSupported, publicKey, supportStatus]);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupportStatus(supported ? "supported" : "unsupported");

    if (!supported) {
      setFeedback({
        tone: "info",
        message: isIosBrowserTab()
          ? "iPhone/iPad Safari 탭에서는 Web Push를 받을 수 없습니다. 홈 화면에 추가한 PWA에서 다시 열어 주세요."
          : "이 브라우저는 Web Push를 지원하지 않습니다.",
      });
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(Boolean(subscription));
      })
      .catch(() => {
        setFeedback({ tone: "error", message: "서비스 워커 등록에 실패했습니다." });
      });
  }, []);

  const subscribe = async () => {
    if (!canSubscribe) {
      if (disabledReason) {
        setFeedback({ tone: "info", message: disabledReason });
      }
      return;
    }

    setIsWorking(true);
    setFeedback(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("브라우저 알림 권한이 허용되지 않았습니다.");
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await requestJson("/api/admin/web-push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription: serializeSubscription(subscription) }),
      });

      setIsSubscribed(true);
      setFeedback({ tone: "success", message: "앱푸시 구독을 저장했습니다." });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "앱푸시 구독에 실패했습니다.",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const unsubscribe = async () => {
    if (!isSupported || isWorking) {
      return;
    }

    setIsWorking(true);
    setFeedback(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? null;

      await subscription?.unsubscribe();

      if (endpoint) {
        await requestJson("/api/admin/web-push/unsubscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint }),
        });
      }

      setIsSubscribed(false);
      setFeedback({ tone: "success", message: "앱푸시 구독을 해제했습니다." });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "앱푸시 구독 해제에 실패했습니다.",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const sendTest = async () => {
    if (!isSubscribed || isWorking) {
      return;
    }

    setIsWorking(true);
    setFeedback(null);

    try {
      await requestJson("/api/admin/web-push/send-test", { method: "POST", body: "{}" });
      setFeedback({ tone: "success", message: "테스트 앱푸시를 요청했습니다." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "테스트 앱푸시 발송에 실패했습니다.",
      });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className={styles.webPushPanel}>
      <div>
        <strong>이 브라우저 앱푸시</strong>
        <p>
          {isSubscribed
            ? "현재 브라우저의 Web Push 구독이 저장되어 있습니다."
            : "현재 브라우저에서 앱푸시 구독을 저장할 수 있습니다."}
        </p>
      </div>
      <div className={styles.webPushActions}>
        <button
          className="button-secondary"
          disabled={!canSubscribe || isSubscribed}
          onClick={subscribe}
          type="button"
        >
          구독 저장
        </button>
        <button
          className="button-secondary"
          disabled={supportStatus === "checking" || !isSupported || !isSubscribed || isWorking}
          onClick={sendTest}
          type="button"
        >
          테스트 발송
        </button>
        <button
          className={styles.deleteButton}
          disabled={supportStatus === "checking" || !isSupported || !isSubscribed || isWorking}
          onClick={unsubscribe}
          type="button"
        >
          해제
        </button>
      </div>
      {disabledReason ? (
        <p
          className={
            !isSupported || !isConfigured || !publicKey
              ? styles.preferenceWarning
              : styles.webPushFeedback
          }
        >
          {disabledReason}
        </p>
      ) : null}
      {feedback ? (
        <p
          className={`${styles.webPushFeedback} ${
            feedback.tone === "error" ? styles.webPushFeedbackError : ""
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
