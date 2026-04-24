export const createDeliveryIdempotencyKey = (
  jobIdempotencyKey: string,
  recipientId: string,
  channelAddress: string,
) => `${jobIdempotencyKey}:${recipientId}:EMAIL:${encodeURIComponent(channelAddress.trim().toLowerCase())}`;
