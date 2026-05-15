// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import { syncInstallationRepositories } from "@/lib/github/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const installationId = Number(requestUrl.searchParams.get("installation_id"));
  const redirectUrl = new URL("/repositories", requestUrl.origin);

  if (!Number.isFinite(installationId) || installationId <= 0) {
    redirectUrl.searchParams.set("githubSync", "missing");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    await syncInstallationRepositories(installationId, { runInitialScan: false });
    redirectUrl.searchParams.set("filter", "all");
    redirectUrl.searchParams.set("githubSync", "success");
    redirectUrl.searchParams.set("installationId", String(installationId));
    redirectUrl.searchParams.set("syncId", String(Date.now()));
  } catch {
    redirectUrl.searchParams.set("githubSync", "error");
  }

  return NextResponse.redirect(redirectUrl);
}
