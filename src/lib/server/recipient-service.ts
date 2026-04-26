import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env, isWebPushConfigured } from "@/lib/env";
import { logOperation } from "@/lib/ops-log";
import {
  ADMIN_RECIPIENT_ID,
  canUseDatabase,
  normalizeEmailAddress,
} from "@/lib/server/job-shared";
import type {
  ChannelType,
  NotificationPreferenceRecord,
  RecipientChannelRecord,
  RecipientRecord,
} from "@/lib/types";

type RecipientDbClient = Prisma.TransactionClient | typeof prisma;
type RecipientEmailChannel = {
  id: string;
  type: RecipientChannelRecord["type"];
  address: string;
  isPrimary: boolean;
  isVerified: boolean;
  metadata?: unknown;
};
type RecipientNotificationPreference = {
  alertType: "CLOSING_DAY_ANALYSIS";
  channelType: RecipientChannelRecord["type"];
  isActive: boolean;
};

const ADMIN_RECIPIENT_EMAIL_LOG_SOURCE = "admin:recipient-email";
const DEFAULT_ALERT_TYPE = "CLOSING_DAY_ANALYSIS";
const DEFAULT_CHANNEL_PREFERENCES: Array<{
  channelType: RecipientChannelRecord["type"];
  isActive: boolean;
}> = [
  { channelType: "EMAIL", isActive: true },
  { channelType: "WEB_PUSH", isActive: false },
];
const CHANNEL_PREFERENCE_COPY: Record<
  Extract<ChannelType, "EMAIL" | "WEB_PUSH">,
  Pick<NotificationPreferenceRecord, "label" | "description" | "isAvailable">
> = {
  EMAIL: {
    label: "이메일",
    description: "검증된 이메일 주소로 10시 분석 메일을 발송합니다.",
    isAvailable: true,
  },
  WEB_PUSH: {
    label: "앱푸시",
    description: "PWA 설치와 Web Push 구독 저장을 연결한 뒤 활성화합니다.",
    isAvailable: true,
  },
};

const listRecipientEmailChannelsWithClient = async (
  client: RecipientDbClient,
  recipientId: string,
) => client.recipientChannel.findMany({
    where: {
      recipientId,
      type: "EMAIL",
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

const listRecipientEmailChannels = async (recipientId: string) =>
  listRecipientEmailChannelsWithClient(prisma, recipientId);

export const getPrimaryRecipientChannelRepairId = (
  channels: Array<Pick<RecipientEmailChannel, "id" | "isPrimary">>,
) => {
  if (channels.length === 0 || channels.some((channel) => channel.isPrimary)) {
    return null;
  }

  return channels[0]?.id ?? null;
};

const toRecipientChannelRecord = (channel: RecipientEmailChannel): RecipientChannelRecord => ({
  id: channel.id,
  type: channel.type,
  address: channel.address,
  isPrimary: channel.isPrimary,
  isVerified: channel.isVerified,
  ...("metadata" in channel && channel.metadata !== undefined ? { metadata: channel.metadata } : {}),
});

export const isNotificationChannelEnabled = ({
  alertType,
  channelType,
  preferences,
}: {
  alertType: RecipientNotificationPreference["alertType"];
  channelType: RecipientChannelRecord["type"];
  preferences: RecipientNotificationPreference[];
}) => {
  const preference = preferences.find(
    (item) => item.alertType === alertType && item.channelType === channelType,
  );

  if (preference) {
    return preference.isActive;
  }

  return channelType === "EMAIL";
};

export const toResolvedAlertRecipientRecord = (recipient: {
  id: string;
  name: string;
  status: RecipientRecord["status"];
  inviteState: RecipientRecord["inviteState"];
  consentedAt: Date | null;
  unsubscribedAt: Date | null;
  channels: Array<{
    id: string;
    type: RecipientChannelRecord["type"];
    address: string;
    isPrimary: boolean;
    isVerified: boolean;
    metadata?: unknown;
  }>;
  notificationPreferences?: RecipientNotificationPreference[];
}): RecipientRecord => ({
  id: recipient.id,
  name: recipient.name,
  status: recipient.status,
  inviteState: recipient.inviteState,
  consentedAt: recipient.consentedAt,
  unsubscribedAt: recipient.unsubscribedAt,
  channels: recipient.channels
    .filter((channel) =>
      (channel.type === "EMAIL" || channel.type === "WEB_PUSH")
      && channel.isVerified
      && isNotificationChannelEnabled({
        alertType: DEFAULT_ALERT_TYPE,
        channelType: channel.type,
        preferences: recipient.notificationPreferences ?? [],
      }),
    )
    .map((channel) => ({
      id: channel.id,
      type: channel.type,
      address: channel.address,
      isPrimary: channel.isPrimary,
      isVerified: channel.isVerified,
      ...(channel.metadata !== undefined ? { metadata: channel.metadata } : {}),
    })),
});

const ensurePrimaryRecipientEmailChannel = async (
  client: RecipientDbClient,
  channels: RecipientEmailChannel[],
) => {
  const repairId = getPrimaryRecipientChannelRepairId(channels);
  if (!repairId) {
    return channels;
  }

  await client.recipientChannel.update({
    where: { id: repairId },
    data: { isPrimary: true },
  });

  return channels.map((channel) => ({
    ...channel,
    isPrimary: channel.id === repairId,
  }));
};

const ensureAdminRecipientTelegramPlaceholder = async (
  client: RecipientDbClient,
  recipientId: string,
) => client.recipientChannel.upsert({
  where: {
    recipientId_type_address: {
      recipientId,
      type: "TELEGRAM",
      address: "@placeholder",
    },
  },
  update: {},
  create: {
    recipientId,
    type: "TELEGRAM",
    address: "@placeholder",
    isPrimary: false,
    isVerified: false,
    metadata: { enabled: false },
  },
});

const ensureAdminRecipientSubscription = async (
  client: RecipientDbClient,
  recipientId: string,
) => {
  const existingSubscription = await client.subscription.findFirst({
    where: {
      recipientId,
      alertType: "CLOSING_DAY_ANALYSIS",
    },
  });

  if (existingSubscription) {
    return;
  }

  await client.subscription.create({
    data: {
      recipientId,
      alertType: "CLOSING_DAY_ANALYSIS",
      scope: { mode: "ALL_IPOS" },
      isActive: true,
    },
  });
};

const ensureAdminRecipientNotificationPreferences = async (
  client: RecipientDbClient,
  recipientId: string,
) => {
  await Promise.all(DEFAULT_CHANNEL_PREFERENCES.map((preference) =>
    client.notificationPreference.upsert({
      where: {
        recipientId_alertType_channelType: {
          recipientId,
          alertType: DEFAULT_ALERT_TYPE,
          channelType: preference.channelType,
        },
      },
      update: {},
      create: {
        recipientId,
        alertType: DEFAULT_ALERT_TYPE,
        channelType: preference.channelType,
        isActive: preference.isActive,
      },
    }),
  ));
};

const toNotificationPreferenceRecord = (
  preference: RecipientNotificationPreference,
  overrides: Partial<Pick<NotificationPreferenceRecord, "description" | "isAvailable">> = {},
): NotificationPreferenceRecord => {
  const copy = CHANNEL_PREFERENCE_COPY[preference.channelType as "EMAIL" | "WEB_PUSH"] ?? {
    label: preference.channelType,
    description: "아직 관리자 화면에서 관리하지 않는 알림 채널입니다.",
    isAvailable: false,
  };

  return {
    alertType: preference.alertType,
    channelType: preference.channelType,
    isActive: preference.isActive,
    isAvailable: overrides.isAvailable ?? copy.isAvailable,
    label: copy.label,
    description: overrides.description ?? copy.description,
  };
};

export const ensureAdminRecipient = async (): Promise<{ id: string } | null> => {
  if (!(await canUseDatabase())) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const recipient = await tx.recipient.upsert({
      where: { id: ADMIN_RECIPIENT_ID },
      update: {
        name: "관리자",
        status: "ACTIVE",
        inviteState: "INTERNAL",
        consentedAt: new Date(),
        unsubscribedAt: null,
      },
      create: {
        id: ADMIN_RECIPIENT_ID,
        name: "관리자",
        status: "ACTIVE",
        inviteState: "INTERNAL",
        consentedAt: new Date(),
      },
    });

    const seedEmail = normalizeEmailAddress(env.adminEmail);
    let emailChannels = await listRecipientEmailChannelsWithClient(tx, recipient.id);

    if (emailChannels.length === 0 && seedEmail) {
      await tx.recipientChannel.create({
        data: {
          recipientId: recipient.id,
          type: "EMAIL",
          address: seedEmail,
          isPrimary: true,
          isVerified: true,
        },
      });

      emailChannels = await listRecipientEmailChannelsWithClient(tx, recipient.id);
    }

    await ensurePrimaryRecipientEmailChannel(tx, emailChannels);
    await ensureAdminRecipientTelegramPlaceholder(tx, recipient.id);
    await ensureAdminRecipientSubscription(tx, recipient.id);
    await ensureAdminRecipientNotificationPreferences(tx, recipient.id);

    return {
      id: recipient.id,
    };
  });
};

export const getAdminRecipientEmailChannels = async (): Promise<RecipientChannelRecord[]> => {
  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    return [];
  }

  const channels = await listRecipientEmailChannels(recipient.id);
  return channels.map(toRecipientChannelRecord);
};

export const getAdminNotificationPreferences = async (): Promise<NotificationPreferenceRecord[]> => {
  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    return DEFAULT_CHANNEL_PREFERENCES.map((preference) =>
      toNotificationPreferenceRecord({
        alertType: DEFAULT_ALERT_TYPE,
        channelType: preference.channelType,
        isActive: preference.isActive,
      }),
    );
  }

  const [preferences, webPushSubscriptionCount] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: {
        recipientId: recipient.id,
        alertType: DEFAULT_ALERT_TYPE,
        channelType: {
          in: DEFAULT_CHANNEL_PREFERENCES.map((preference) => preference.channelType),
        },
      },
      orderBy: [{ channelType: "asc" }],
    }),
    prisma.recipientChannel.count({
      where: {
        recipientId: recipient.id,
        type: "WEB_PUSH",
        isVerified: true,
      },
    }),
  ]);

  return DEFAULT_CHANNEL_PREFERENCES.map((fallbackPreference) => {
    const preference = preferences.find(
      (item) => item.channelType === fallbackPreference.channelType,
    );
    const webPushUnavailable =
      fallbackPreference.channelType === "WEB_PUSH"
      && (!isWebPushConfigured() || webPushSubscriptionCount === 0);

    return toNotificationPreferenceRecord(
      {
        alertType: DEFAULT_ALERT_TYPE,
        channelType: fallbackPreference.channelType,
        isActive: preference?.isActive ?? fallbackPreference.isActive,
      },
      webPushUnavailable
        ? {
            isAvailable: false,
            description: !isWebPushConfigured()
              ? "VAPID 환경변수를 설정한 뒤 앱푸시를 구독할 수 있습니다."
              : "이 브라우저의 앱푸시 구독을 먼저 저장해야 활성화할 수 있습니다.",
          }
        : undefined,
    );
  });
};

const assertWebPushPreferenceCanBeEnabled = async (recipientId: string) => {
  if (!isWebPushConfigured()) {
    throw new Error("Web Push VAPID 설정이 없습니다.");
  }

  const subscriptionCount = await prisma.recipientChannel.count({
    where: {
      recipientId,
      type: "WEB_PUSH",
      isVerified: true,
    },
  });

  if (subscriptionCount === 0) {
    throw new Error("저장된 Web Push 구독이 없습니다.");
  }
};

export const updateAdminNotificationPreference = async ({
  channelType,
  isActive,
}: {
  channelType: Extract<ChannelType, "EMAIL" | "WEB_PUSH">;
  isActive: boolean;
}): Promise<NotificationPreferenceRecord> => {
  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    throw new Error("DB 연결이 없어 알림 채널 설정을 수정할 수 없습니다.");
  }

  const channelCopy = CHANNEL_PREFERENCE_COPY[channelType];
  if (isActive && channelType === "WEB_PUSH") {
    await assertWebPushPreferenceCanBeEnabled(recipient.id);
  }

  const preference = await prisma.notificationPreference.upsert({
    where: {
      recipientId_alertType_channelType: {
        recipientId: recipient.id,
        alertType: DEFAULT_ALERT_TYPE,
        channelType,
      },
    },
    update: {
      isActive,
    },
    create: {
      recipientId: recipient.id,
      alertType: DEFAULT_ALERT_TYPE,
      channelType,
      isActive,
    },
  });

  await logOperation({
    level: "INFO",
    source: ADMIN_RECIPIENT_EMAIL_LOG_SOURCE,
    action: "preference_updated",
    message: `${channelCopy.label} 알림 채널을 ${isActive ? "켰습니다" : "껐습니다"}.`,
    context: {
      recipientId: recipient.id,
      alertType: DEFAULT_ALERT_TYPE,
      channelType,
      isActive,
    },
  });

  return toNotificationPreferenceRecord(preference);
};

export const addAdminRecipientEmail = async (address: string): Promise<RecipientChannelRecord> => {
  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    throw new Error("DB 연결이 없어 이메일을 등록할 수 없습니다.");
  }

  const normalizedAddress = normalizeEmailAddress(address);

  const channel = await prisma.$transaction(async (tx) => {
    const emailChannels = await tx.recipientChannel.findMany({
      where: {
        recipientId: recipient.id,
        type: "EMAIL",
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    if (emailChannels.some((emailChannel) => emailChannel.address === normalizedAddress)) {
      throw new Error("이미 등록된 이메일 주소입니다.");
    }

    const shouldBecomePrimary = emailChannels.length === 0 || !emailChannels.some((emailChannel) => emailChannel.isPrimary);
    const createdChannel = await tx.recipientChannel.create({
      data: {
        recipientId: recipient.id,
        type: "EMAIL",
        address: normalizedAddress,
        isPrimary: shouldBecomePrimary,
        isVerified: true,
      },
    });

    if (shouldBecomePrimary) {
      await tx.recipientChannel.updateMany({
        where: {
          recipientId: recipient.id,
          type: "EMAIL",
          id: { not: createdChannel.id },
        },
        data: {
          isPrimary: false,
        },
      });
    }

    return createdChannel;
  });

  await logOperation({
    level: "INFO",
    source: ADMIN_RECIPIENT_EMAIL_LOG_SOURCE,
    action: "added",
    message: `발송 이메일 ${normalizedAddress}를 등록했습니다.`,
    context: {
      recipientId: recipient.id,
      channelId: channel.id,
      address: normalizedAddress,
    },
  });

  return toRecipientChannelRecord(channel);
};

export const updateAdminRecipientEmail = async (
  channelId: string,
  address: string,
): Promise<RecipientChannelRecord> => {
  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    throw new Error("DB 연결이 없어 이메일을 수정할 수 없습니다.");
  }

  const normalizedAddress = normalizeEmailAddress(address);

  const channel = await prisma.$transaction(async (tx) => {
    const currentChannel = await tx.recipientChannel.findFirst({
      where: {
        id: channelId,
        recipientId: recipient.id,
        type: "EMAIL",
      },
    });

    if (!currentChannel) {
      throw new Error("수정할 이메일을 찾지 못했습니다.");
    }

    const duplicateChannel = await tx.recipientChannel.findFirst({
      where: {
        recipientId: recipient.id,
        type: "EMAIL",
        address: normalizedAddress,
        id: { not: channelId },
      },
    });

    if (duplicateChannel) {
      throw new Error("이미 등록된 이메일 주소입니다.");
    }

    return tx.recipientChannel.update({
      where: { id: channelId },
      data: {
        address: normalizedAddress,
        isVerified: true,
      },
    });
  });

  await logOperation({
    level: "INFO",
    source: ADMIN_RECIPIENT_EMAIL_LOG_SOURCE,
    action: "updated",
    message: `발송 이메일을 ${normalizedAddress}로 수정했습니다.`,
    context: {
      recipientId: recipient.id,
      channelId: channel.id,
      address: normalizedAddress,
    },
  });

  return toRecipientChannelRecord(channel);
};

export const deleteAdminRecipientEmail = async (channelId: string): Promise<{ address: string }> => {
  const recipient = await ensureAdminRecipient();
  if (!recipient) {
    throw new Error("DB 연결이 없어 이메일을 삭제할 수 없습니다.");
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const emailChannels = await tx.recipientChannel.findMany({
      where: {
        recipientId: recipient.id,
        type: "EMAIL",
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    const targetChannel = emailChannels.find((emailChannel) => emailChannel.id === channelId);

    if (!targetChannel) {
      throw new Error("삭제할 이메일을 찾지 못했습니다.");
    }

    if (emailChannels.length <= 1) {
      throw new Error("최소 1개의 발송 이메일은 유지되어야 합니다.");
    }

    await tx.recipientChannel.delete({
      where: { id: channelId },
    });

    const remainingChannels = emailChannels.filter((emailChannel) => emailChannel.id !== channelId);
    await ensurePrimaryRecipientEmailChannel(tx, remainingChannels);

    return {
      address: targetChannel.address,
    };
  });

  await logOperation({
    level: "INFO",
    source: ADMIN_RECIPIENT_EMAIL_LOG_SOURCE,
    action: "deleted",
    message: `발송 이메일 ${deleted.address}를 삭제했습니다.`,
    context: {
      recipientId: recipient.id,
      channelId,
      address: deleted.address,
    },
  });

  return deleted;
};

export const resolveAlertRecipients = async (): Promise<RecipientRecord[]> => {
  if (!(await canUseDatabase())) {
    return [];
  }

  await ensureAdminRecipient();

  const recipients = await prisma.recipient.findMany({
    where: {
      status: "ACTIVE",
      unsubscribedAt: null,
      subscriptions: {
        some: {
          alertType: "CLOSING_DAY_ANALYSIS",
          isActive: true,
        },
      },
    },
    include: {
      channels: true,
      notificationPreferences: true,
    },
  });

  return recipients
    .map(toResolvedAlertRecipientRecord)
    .filter((recipient) => recipient.channels.length > 0);
};
