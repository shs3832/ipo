import webpush, { type PushSubscription } from "web-push";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env, isWebPushConfigured } from "@/lib/env";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { ADMIN_RECIPIENT_ID } from "@/lib/server/job-shared";
import {
  ensureAdminRecipient,
  type AdminRecipientRef,
} from "@/lib/server/recipient-service";
import type { NotificationJobRecord } from "@/lib/types";

type WebPushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type WebPushNotificationPayload = {
  title: string;
  body: string;
  url?: string | null;
  icon?: string;
  badge?: string;
  tag?: string;
};

const WEB_PUSH_LOG_SOURCE = "admin:web-push";

const isWebPushSubscriptionPayload = (value: unknown): value is WebPushSubscriptionPayload => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: {
      p256dh?: unknown;
      auth?: unknown;
    };
  };

  return (
    typeof payload.endpoint === "string"
    && payload.endpoint.startsWith("https://")
    && (!("expirationTime" in payload)
      || payload.expirationTime === null
      || typeof payload.expirationTime === "number")
    && typeof payload.keys?.p256dh === "string"
    && typeof payload.keys.auth === "string"
  );
};

const configureWebPush = () => {
  if (!isWebPushConfigured()) {
    throw new Error("Web Push VAPID 설정이 없습니다.");
  }

  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
};

const toPushSubscription = (subscription: WebPushSubscriptionPayload): PushSubscription => ({
  endpoint: subscription.endpoint,
  expirationTime: subscription.expirationTime ?? null,
  keys: {
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  },
});

const buildPushChannelMetadata = (
  subscription: WebPushSubscriptionPayload,
  userAgent: string | null,
): Prisma.InputJsonObject => ({
  endpoint: subscription.endpoint,
  expirationTime: subscription.expirationTime ?? null,
  keys: {
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  },
  userAgent,
  subscribedAt: new Date().toISOString(),
});

const getSubscriptionFromMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return isWebPushSubscriptionPayload(metadata) ? metadata : null;
};

export const getAdminWebPushState = async (adminRecipient?: AdminRecipientRef) => {
  const recipient = adminRecipient === undefined ? await ensureAdminRecipient() : adminRecipient;
  if (!recipient) {
    return {
      isConfigured: isWebPushConfigured(),
      publicKey: env.vapidPublicKey,
      subscriptionCount: 0,
    };
  }

  const subscriptionCount = await prisma.recipientChannel.count({
    where: {
      recipientId: recipient.id,
      type: "WEB_PUSH",
      isVerified: true,
    },
  });

  return {
    isConfigured: isWebPushConfigured(),
    publicKey: env.vapidPublicKey,
    subscriptionCount,
  };
};

export const upsertAdminWebPushSubscription = async ({
  subscription,
  userAgent,
}: {
  subscription: unknown;
  userAgent: string | null;
}) => {
  if (!isWebPushConfigured()) {
    throw new Error("Web Push VAPID 설정이 없습니다.");
  }

  if (!isWebPushSubscriptionPayload(subscription)) {
    throw new Error("유효한 Web Push 구독 정보가 아닙니다.");
  }

  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    throw new Error("DB 연결이 없어 Web Push 구독을 저장할 수 없습니다.");
  }

  const channel = await prisma.recipientChannel.upsert({
    where: {
      recipientId_type_address: {
        recipientId: recipient.id,
        type: "WEB_PUSH",
        address: subscription.endpoint,
      },
    },
    update: {
      isVerified: true,
      metadata: buildPushChannelMetadata(subscription, userAgent),
    },
    create: {
      recipientId: recipient.id,
      type: "WEB_PUSH",
      address: subscription.endpoint,
      isPrimary: false,
      isVerified: true,
      metadata: buildPushChannelMetadata(subscription, userAgent),
    },
  });

  await prisma.notificationPreference.upsert({
    where: {
      recipientId_alertType_channelType: {
        recipientId: recipient.id,
        alertType: "CLOSING_DAY_ANALYSIS",
        channelType: "WEB_PUSH",
      },
    },
    update: {
      isActive: true,
    },
    create: {
      recipientId: recipient.id,
      alertType: "CLOSING_DAY_ANALYSIS",
      channelType: "WEB_PUSH",
      isActive: true,
    },
  });

  await logOperation({
    level: "INFO",
    source: WEB_PUSH_LOG_SOURCE,
    action: "subscribed",
    message: "관리자 Web Push 구독을 저장했습니다.",
    context: {
      recipientId: recipient.id,
      channelId: channel.id,
      endpointHost: new URL(subscription.endpoint).host,
    },
  });

  return { channelId: channel.id };
};

export const deleteAdminWebPushSubscription = async (endpoint: unknown) => {
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    throw new Error("삭제할 Web Push endpoint를 찾지 못했습니다.");
  }

  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    throw new Error("DB 연결이 없어 Web Push 구독을 삭제할 수 없습니다.");
  }

  await prisma.recipientChannel.deleteMany({
    where: {
      recipientId: recipient.id,
      type: "WEB_PUSH",
      address: endpoint,
    },
  });

  const remainingCount = await prisma.recipientChannel.count({
    where: {
      recipientId: recipient.id,
      type: "WEB_PUSH",
      isVerified: true,
    },
  });

  if (remainingCount === 0) {
    await prisma.notificationPreference.upsert({
      where: {
        recipientId_alertType_channelType: {
          recipientId: recipient.id,
          alertType: "CLOSING_DAY_ANALYSIS",
          channelType: "WEB_PUSH",
        },
      },
      update: {
        isActive: false,
      },
      create: {
        recipientId: recipient.id,
        alertType: "CLOSING_DAY_ANALYSIS",
        channelType: "WEB_PUSH",
        isActive: false,
      },
    });
  }

  await logOperation({
    level: "INFO",
    source: WEB_PUSH_LOG_SOURCE,
    action: "unsubscribed",
    message: "관리자 Web Push 구독을 삭제했습니다.",
    context: {
      recipientId: recipient.id,
      endpointHost: new URL(endpoint).host,
      remainingCount,
    },
  });
};

export const sendWebPushNotification = async ({
  subscription,
  payload,
}: {
  subscription: WebPushSubscriptionPayload;
  payload: WebPushNotificationPayload;
}) => {
  configureWebPush();

  const response = await webpush.sendNotification(
    toPushSubscription(subscription),
    JSON.stringify({
      icon: "/icons/icon.svg",
      badge: "/icons/badge.svg",
      ...payload,
    }),
  );

  return {
    providerMessageId: String(response.statusCode),
  };
};

export const buildWebPushPayloadFromJob = (
  job: NotificationJobRecord,
): WebPushNotificationPayload => ({
  title: job.payload.subject,
  body: job.payload.intro,
  url: job.payload.webUrl,
  tag: job.idempotencyKey,
});

export const sendAdminTestWebPush = async () => {
  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    throw new Error("DB 연결이 없어 테스트 푸시를 보낼 수 없습니다.");
  }

  const channels = await prisma.recipientChannel.findMany({
    where: {
      recipientId: ADMIN_RECIPIENT_ID,
      type: "WEB_PUSH",
      isVerified: true,
    },
  });

  if (channels.length === 0) {
    throw new Error("저장된 Web Push 구독이 없습니다.");
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const channel of channels) {
    const subscription = getSubscriptionFromMetadata(channel.metadata);
    if (!subscription) {
      failedCount += 1;
      continue;
    }

    try {
      await sendWebPushNotification({
        subscription,
        payload: {
          title: "IPO 10시 알림 테스트",
          body: "이 기기로 앱푸시가 정상 도착했습니다. 앱푸시 채널이 ON이면 10시 자동 알림도 이 기기로 받습니다.",
          url: "/admin/recipients",
          tag: "admin-web-push-test",
        },
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await logOperation({
        level: "ERROR",
        source: WEB_PUSH_LOG_SOURCE,
        action: "test_failed",
        message: "관리자 Web Push 테스트 발송에 실패했습니다.",
        context: toErrorContext(error, {
          channelId: channel.id,
          endpointHost: new URL(channel.address).host,
        }),
      });
    }
  }

  await logOperation({
    level: failedCount > 0 ? "WARN" : "INFO",
    source: WEB_PUSH_LOG_SOURCE,
    action: "test_completed",
    message: `관리자 Web Push 테스트를 완료했습니다. 성공 ${sentCount}건, 실패 ${failedCount}건입니다.`,
    context: {
      sentCount,
      failedCount,
    },
  });

  return { sentCount, failedCount };
};

export const parseWebPushSubscriptionMetadata = getSubscriptionFromMetadata;
