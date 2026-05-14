// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { backfillStoredChangelogEntries } from "@/lib/changelog/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const limit = Number(requestUrl.searchParams.get("limit") || "20");
  const shouldDispatch = requestUrl.searchParams.get("dispatch") !== "false";
  const result = await backfillStoredChangelogEntries({
    limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
    dispatch: shouldDispatch,
  });

  return NextResponse.json(result);
}
