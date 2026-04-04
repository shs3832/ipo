"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addAdminRecipientEmail,
  deleteAdminRecipientEmail,
  updateAdminRecipientEmail,
} from "@/lib/jobs";
import { ADMIN_RECIPIENTS_PATH } from "@/lib/admin-navigation";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { ensureAdminAuthenticated, revalidateAdminPaths } from "@/lib/server/admin-surface";

const emailSchema = z
  .string()
  .trim()
  .min(1, "유효한 이메일 주소를 입력해 주세요.")
  .email("유효한 이메일 주소를 입력해 주세요.")
  .transform((value) => value.toLowerCase());

const channelIdSchema = z.string().trim().min(1, "대상 이메일을 찾지 못했습니다.");

const getStringValue = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

const buildRedirectTarget = (status: "success" | "error", message: string) => {
  const searchParams = new URLSearchParams({
    status,
    message,
  });

  return `${ADMIN_RECIPIENTS_PATH}?${searchParams.toString()}`;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const ADMIN_RECIPIENT_EMAIL_LOG_SOURCE = "admin:recipient-email";

const revalidateAdminRecipientPaths = () => {
  revalidateAdminPaths(ADMIN_RECIPIENTS_PATH);
};

const parseAdminRecipientEmailAddress = (formData: FormData) => {
  const parsedAddress = emailSchema.safeParse(getStringValue(formData, "address"));
  if (!parsedAddress.success) {
    redirect(buildRedirectTarget("error", "유효한 이메일 주소를 입력해 주세요."));
  }

  return parsedAddress.data;
};

const parseAdminRecipientChannelPayload = (formData: FormData) => {
  const parsedChannelId = channelIdSchema.safeParse(getStringValue(formData, "channelId"));
  const parsedAddress = emailSchema.safeParse(getStringValue(formData, "address"));

  if (!parsedChannelId.success || !parsedAddress.success) {
    redirect(buildRedirectTarget("error", "수정할 이메일 정보를 다시 확인해 주세요."));
  }

  return {
    channelId: parsedChannelId.data,
    address: parsedAddress.data,
  };
};

const parseAdminRecipientDeletePayload = (formData: FormData) => {
  const parsedChannelId = channelIdSchema.safeParse(getStringValue(formData, "channelId"));

  if (!parsedChannelId.success) {
    redirect(buildRedirectTarget("error", "삭제할 이메일 정보를 다시 확인해 주세요."));
  }

  return {
    channelId: parsedChannelId.data,
  };
};

async function runAdminRecipientMutationAction<T>({
  failureMessage,
  errorAction,
  errorLogMessage,
  mutate,
  buildSuccessRedirectTarget,
  buildErrorContext,
}: {
  failureMessage: string;
  errorAction: "add_failed" | "update_failed" | "delete_failed";
  errorLogMessage: string;
  mutate: () => Promise<T>;
  buildSuccessRedirectTarget: (result: T) => string;
  buildErrorContext?: () => Record<string, unknown> | undefined;
}) {
  let redirectTarget = buildRedirectTarget("error", failureMessage);

  try {
    const result = await mutate();
    revalidateAdminRecipientPaths();
    redirectTarget = buildSuccessRedirectTarget(result);
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: ADMIN_RECIPIENT_EMAIL_LOG_SOURCE,
      action: errorAction,
      message: errorLogMessage,
      context: toErrorContext(error, buildErrorContext?.()),
    });
    redirectTarget = buildRedirectTarget("error", getErrorMessage(error, failureMessage));
  }

  redirect(redirectTarget);
}

export async function addAdminRecipientEmailAction(formData: FormData) {
  await ensureAdminAuthenticated(ADMIN_RECIPIENTS_PATH);
  const address = parseAdminRecipientEmailAddress(formData);

  await runAdminRecipientMutationAction({
    failureMessage: "발송 이메일 등록에 실패했습니다.",
    errorAction: "add_failed",
    errorLogMessage: "관리자 이메일 등록 요청 처리에 실패했습니다.",
    mutate: () => addAdminRecipientEmail(address),
    buildSuccessRedirectTarget: (channel) =>
      buildRedirectTarget("success", `${channel.address} 주소를 등록했습니다.`),
  });
}

export async function updateAdminRecipientEmailAction(formData: FormData) {
  await ensureAdminAuthenticated(ADMIN_RECIPIENTS_PATH);
  const parsedPayload = parseAdminRecipientChannelPayload(formData);

  await runAdminRecipientMutationAction({
    failureMessage: "발송 이메일 수정에 실패했습니다.",
    errorAction: "update_failed",
    errorLogMessage: "관리자 이메일 수정 요청 처리에 실패했습니다.",
    mutate: () => updateAdminRecipientEmail(parsedPayload.channelId, parsedPayload.address),
    buildSuccessRedirectTarget: (channel) =>
      buildRedirectTarget("success", `${channel.address} 주소로 수정했습니다.`),
    buildErrorContext: () => ({
      channelId: parsedPayload.channelId,
    }),
  });
}

export async function deleteAdminRecipientEmailAction(formData: FormData) {
  await ensureAdminAuthenticated(ADMIN_RECIPIENTS_PATH);
  const parsedPayload = parseAdminRecipientDeletePayload(formData);

  await runAdminRecipientMutationAction({
    failureMessage: "발송 이메일 삭제에 실패했습니다.",
    errorAction: "delete_failed",
    errorLogMessage: "관리자 이메일 삭제 요청 처리에 실패했습니다.",
    mutate: () => deleteAdminRecipientEmail(parsedPayload.channelId),
    buildSuccessRedirectTarget: (deleted) =>
      buildRedirectTarget("success", `${deleted.address} 주소를 삭제했습니다.`),
    buildErrorContext: () => ({
      channelId: parsedPayload.channelId,
    }),
  });
}
