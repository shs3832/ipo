import nodemailer from "nodemailer";

import { env } from "@/lib/env";
import { prepareDailyAlerts, renderMessageHtml } from "@/lib/jobs";

const renderMessageText = (payload: {
  subject: string;
  tags: string[];
  intro: string;
  webUrl: string | null;
  sections: { label: string; lines: string[] }[];
  footer: string[];
}) =>
  [
    payload.subject,
    "",
    ...(payload.tags.length ? [payload.tags.join(" "), ""] : []),
    payload.intro,
    ...(payload.webUrl ? ["", `웹에서 보기: ${payload.webUrl}`] : []),
    "",
    ...payload.sections.flatMap((section) => [section.label, ...section.lines, ""]),
    ...payload.footer,
  ].join("\n");

const main = async () => {
  const prepared = await prepareDailyAlerts();
  const job = prepared.jobs[0];

  if (!job) {
    throw new Error("No prepared alert job found");
  }

  const payload = {
    ...job.payload,
    subject: `[샘플] ${job.payload.subject}`,
    intro: `${job.payload.intro} (수동 샘플 발송)`,
  };

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  const info = await transporter.sendMail({
    from: env.smtpFrom,
    to: env.adminEmail,
    subject: payload.subject,
    text: renderMessageText(payload),
    html: renderMessageHtml(payload),
  });

  console.log(
    JSON.stringify(
      {
        accepted: info.accepted,
        rejected: info.rejected,
        messageId: info.messageId,
        webUrl: payload.webUrl,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
