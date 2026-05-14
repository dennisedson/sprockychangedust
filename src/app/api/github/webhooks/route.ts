import { NextResponse } from "next/server";
import {
  handleGitHubIssueWebhook,
  handleGitHubRepositoryWebhook,
  handleGitHubInstallationWebhook,
  verifyGitHubWebhookSignature,
} from "@/lib/github/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handledEvents = new Set(["installation", "installation_repositories", "issues", "repository"]);

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyGitHubWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event") || "";

  if (!handledEvents.has(event)) {
    return NextResponse.json({ ok: true, ignored: event });
  }

  if (event === "issues") {
    await handleGitHubIssueWebhook(JSON.parse(payload));
  } else if (event === "repository") {
    await handleGitHubRepositoryWebhook(JSON.parse(payload));
  } else {
    await handleGitHubInstallationWebhook(JSON.parse(payload));
  }

  return NextResponse.json({ ok: true });
}
