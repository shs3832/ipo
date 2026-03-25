"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  addAdminRecipientEmail,
  deleteAdminRecipientEmail,
  updateAdminRecipientEmail,
} from "@/lib/jobs";
import { logOperation, toErrorContext } from "@/lib/ops-log";

const RECIPIENTS_PATH = "/admin/recipients";
const LOGIN_PATH = `/login?next=${encodeURIComponent(RECIPIENTS_PATH)}`;

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

  return `${RECIPIENTS_PATH}?${searchParams.toString()}`;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export async function addAdminRecipientEmailAction(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect(LOGIN_PATH);
  }

  const parsedAddress = emailSchema.safeParse(getStringValue(formData, "address"));
  if (!parsedAddress.success) {
    redirect(buildRedirectTarget("error", "유효한 이메일 주소를 입력해 주세요."));
  }

  let redirectTarget = buildRedirectTarget("error", "발송 이메일 등록에 실패했습니다.");

  try {
    const channel = await addAdminRecipientEmail(parsedAddress.data);
    revalidatePath("/admin");
    revalidatePath(RECIPIENTS_PATH);
    redirectTarget = buildRedirectTarget("success", `${channel.address} 주소를 등록했습니다.`);
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "admin:recipient-email",
      action: "add_failed",
      message: "관리자 이메일 등록 요청 처리에 실패했습니다.",
      context: toErrorContext(error),
    });
    redirectTarget = buildRedirectTarget("error", getErrorMessage(error, "발송 이메일 등록에 실패했습니다."));
  }

  redirect(redirectTarget);
}

export async function updateAdminRecipientEmailAction(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect(LOGIN_PATH);
  }

  const parsedChannelId = channelIdSchema.safeParse(getStringValue(formData, "channelId"));
  const parsedAddress = emailSchema.safeParse(getStringValue(formData, "address"));

  if (!parsedChannelId.success || !parsedAddress.success) {
    redirect(buildRedirectTarget("error", "수정할 이메일 정보를 다시 확인해 주세요."));
  }

  let redirectTarget = buildRedirectTarget("error", "발송 이메일 수정에 실패했습니다.");

  try {
    const channel = await updateAdminRecipientEmail(parsedChannelId.data, parsedAddress.data);
    revalidatePath("/admin");
    revalidatePath(RECIPIENTS_PATH);
    redirectTarget = buildRedirectTarget("success", `${channel.address} 주소로 수정했습니다.`);
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "admin:recipient-email",
      action: "update_failed",
      message: "관리자 이메일 수정 요청 처리에 실패했습니다.",
      context: toErrorContext(error, {
        channelId: parsedChannelId.data,
      }),
    });
    redirectTarget = buildRedirectTarget("error", getErrorMessage(error, "발송 이메일 수정에 실패했습니다."));
  }

  redirect(redirectTarget);
}

export async function deleteAdminRecipientEmailAction(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect(LOGIN_PATH);
  }

  const parsedChannelId = channelIdSchema.safeParse(getStringValue(formData, "channelId"));

  if (!parsedChannelId.success) {
    redirect(buildRedirectTarget("error", "삭제할 이메일 정보를 다시 확인해 주세요."));
  }

  let redirectTarget = buildRedirectTarget("error", "발송 이메일 삭제에 실패했습니다.");

  try {
    const deleted = await deleteAdminRecipientEmail(parsedChannelId.data);
    revalidatePath("/admin");
    revalidatePath(RECIPIENTS_PATH);
    redirectTarget = buildRedirectTarget("success", `${deleted.address} 주소를 삭제했습니다.`);
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "admin:recipient-email",
      action: "delete_failed",
      message: "관리자 이메일 삭제 요청 처리에 실패했습니다.",
      context: toErrorContext(error, {
        channelId: parsedChannelId.data,
      }),
    });
    redirectTarget = buildRedirectTarget("error", getErrorMessage(error, "발송 이메일 삭제에 실패했습니다."));
  }

  redirect(redirectTarget);
}
