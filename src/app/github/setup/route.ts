import { NextResponse } from "next/server";
import { syncInstallationRepositories } from "@/lib/github/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const installationId = Number(requestUrl.searchParams.get("installation_id"));

  if (Number.isFinite(installationId) && installationId > 0) {
    await syncInstallationRepositories(installationId);
  }

  return NextResponse.redirect(new URL("/repositories", requestUrl.origin));
}
