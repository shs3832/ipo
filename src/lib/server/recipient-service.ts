import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logOperation } from "@/lib/ops-log";
import {
  ADMIN_RECIPIENT_ID,
  canUseDatabase,
  normalizeEmailAddress,
} from "@/lib/server/job-shared";
import type { RecipientChannelRecord, RecipientRecord } from "@/lib/types";

type RecipientDbClient = Prisma.TransactionClient | typeof prisma;
type RecipientEmailChannel = {
  id: string;
  type: RecipientChannelRecord["type"];
  address: string;
  isPrimary: boolean;
  isVerified: boolean;
};

const ADMIN_RECIPIENT_EMAIL_LOG_SOURCE = "admin:recipient-email";

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
});

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
  }>;
}): RecipientRecord => ({
  id: recipient.id,
  name: recipient.name,
  status: recipient.status,
  inviteState: recipient.inviteState,
  consentedAt: recipient.consentedAt,
  unsubscribedAt: recipient.unsubscribedAt,
  channels: recipient.channels
    .filter((channel) => channel.type === "EMAIL" && channel.isVerified)
    .map((channel) => ({
      id: channel.id,
      type: channel.type,
      address: channel.address,
      isPrimary: channel.isPrimary,
      isVerified: channel.isVerified,
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
    },
  });

  return recipients
    .map(toResolvedAlertRecipientRecord)
    .filter((recipient) => recipient.channels.length > 0);
};
