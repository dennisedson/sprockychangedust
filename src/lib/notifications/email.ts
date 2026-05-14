import { Resend } from "resend";
import { env, requireEnv } from "@/lib/env";
import type { ScanSignal } from "@/lib/scanner/types";

type AlertEmailInput = {
  to: string;
  changelogTitle: string;
  changelogUrl: string;
  severity: "red" | "amber" | "green";
  summary: string;
  repositoryName: string;
  signals: ScanSignal[];
};

export async function sendImpactAlertEmail(input: AlertEmailInput) {
  const resend = new Resend(requireEnv("RESEND_API_KEY"));

  return resend.emails.send({
    from: env.ALERT_FROM_EMAIL,
    to: input.to,
    subject: `[${input.severity.toUpperCase()}] HubSpot changelog impact in ${input.repositoryName}`,
    html: renderAlertEmail(input),
  });
}

function renderAlertEmail(input: AlertEmailInput) {
  const signalRows = input.signals
    .map(
      (signal) => `
        <tr>
          <td style="padding: 10px 0; border-top: 1px solid #dce3ea;">${escapeHtml(signal.filePath)}</td>
          <td style="padding: 10px 0; border-top: 1px solid #dce3ea;">${escapeHtml(signal.label)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <div style="background:#f5f8fa;padding:32px;font-family:Inter,Arial,sans-serif;color:#293b4f;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #dce3ea;border-radius:8px;padding:28px;">
        <div style="background:${input.severity === "red" ? "#feecec" : "#fff5e6"};border-radius:8px;padding:14px 16px;margin-bottom:22px;">
          <strong>${input.severity.toUpperCase()} HubSpot changelog impact detected</strong>
        </div>
        <h1 style="margin:0 0 12px;font-size:24px;">${escapeHtml(input.changelogTitle)}</h1>
        <p style="line-height:1.55;">${escapeHtml(input.summary)}</p>
        <p><strong>Repository:</strong> ${escapeHtml(input.repositoryName)}</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          ${signalRows}
        </table>
        <a href="${input.changelogUrl}" style="display:inline-block;background:#ff7a59;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;">View changelog</a>
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
