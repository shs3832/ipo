import assert from "node:assert/strict";
import test from "node:test";

import {
  getPrimaryRecipientChannelRepairId,
  isNotificationChannelEnabled,
  toResolvedAlertRecipientRecord,
} from "@/lib/server/recipient-service";

test("getPrimaryRecipientChannelRepairId returns the first channel only when primary repair is needed", () => {
  assert.equal(getPrimaryRecipientChannelRepairId([]), null);
  assert.equal(getPrimaryRecipientChannelRepairId([
    { id: "channel-1", isPrimary: true },
    { id: "channel-2", isPrimary: false },
  ]), null);
  assert.equal(getPrimaryRecipientChannelRepairId([
    { id: "channel-1", isPrimary: false },
    { id: "channel-2", isPrimary: false },
  ]), "channel-1");
});

test("toResolvedAlertRecipientRecord keeps only verified email channels for dispatch", () => {
  const recipient = toResolvedAlertRecipientRecord({
    id: "recipient-1",
    name: "관리자",
    status: "ACTIVE",
    inviteState: "INTERNAL",
    consentedAt: null,
    unsubscribedAt: null,
    channels: [
      {
        id: "email-1",
        type: "EMAIL",
        address: "alerts@example.com",
        isPrimary: true,
        isVerified: true,
      },
      {
        id: "email-2",
        type: "EMAIL",
        address: "pending@example.com",
        isPrimary: false,
        isVerified: false,
      },
      {
        id: "telegram-1",
        type: "TELEGRAM",
        address: "@placeholder",
        isPrimary: false,
        isVerified: false,
      },
    ],
  });

  assert.deepEqual(recipient.channels, [
    {
      id: "email-1",
      type: "EMAIL",
      address: "alerts@example.com",
      isPrimary: true,
      isVerified: true,
    },
  ]);
});

test("toResolvedAlertRecipientRecord respects disabled email notification preference", () => {
  const recipient = toResolvedAlertRecipientRecord({
    id: "recipient-1",
    name: "관리자",
    status: "ACTIVE",
    inviteState: "INTERNAL",
    consentedAt: null,
    unsubscribedAt: null,
    notificationPreferences: [
      {
        alertType: "CLOSING_DAY_ANALYSIS",
        channelType: "EMAIL",
        isActive: false,
      },
    ],
    channels: [
      {
        id: "email-1",
        type: "EMAIL",
        address: "alerts@example.com",
        isPrimary: true,
        isVerified: true,
      },
    ],
  });

  assert.deepEqual(recipient.channels, []);
});

test("isNotificationChannelEnabled defaults existing email recipients to enabled", () => {
  assert.equal(
    isNotificationChannelEnabled({
      alertType: "CLOSING_DAY_ANALYSIS",
      channelType: "EMAIL",
      preferences: [],
    }),
    true,
  );
  assert.equal(
    isNotificationChannelEnabled({
      alertType: "CLOSING_DAY_ANALYSIS",
      channelType: "WEB_PUSH",
      preferences: [],
    }),
    false,
  );
});
