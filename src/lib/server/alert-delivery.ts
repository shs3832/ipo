import type { ChannelType } from "@/lib/types";

export const createDeliveryIdempotencyKey = (
  jobIdempotencyKey: string,
  recipientId: string,
  channelAddress: string,
  channelType: ChannelType = "EMAIL",
) =>
  `${jobIdempotencyKey}:${recipientId}:${channelType}:${encodeURIComponent(
    channelAddress.trim().toLowerCase(),
  )}`;
