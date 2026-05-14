import { NextResponse } from "next/server";
import { dispatchImpactNotifications } from "@/lib/notifications/dispatch";
import { runChangelogMonitor } from "@/lib/changelog/monitor";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runChangelogMonitor();
  const dispatches = await Promise.all(
    result.analyzedEntryIds.map((entryId) => dispatchImpactNotifications(entryId)),
  );

  return NextResponse.json({
    ...result,
    dispatches,
  });
}
