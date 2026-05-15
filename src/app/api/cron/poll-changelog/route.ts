import { NextResponse } from "next/server";
import { dispatchImpactNotifications } from "@/lib/notifications/dispatch";
import { runChangelogMonitor } from "@/lib/changelog/monitor";
import { env } from "@/lib/env";
import {
  countQueuedInstalledRepositoryScans,
  scanQueuedInstalledRepositories,
} from "@/lib/scanner/scanInstalledRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runChangelogMonitor();
  const repositoryScanOutcomes = await scanQueuedInstalledRepositories({ limit: 5 });
  const remainingRepositoryScans = await countQueuedInstalledRepositoryScans();
  const dispatches = await Promise.all(
    result.analyzedEntryIds.map((entryId) => dispatchImpactNotifications(entryId)),
  );

  return NextResponse.json({
    ...result,
    repositoryScans: {
      failed: repositoryScanOutcomes.filter((outcome) => outcome.error).length,
      remaining: remainingRepositoryScans,
      scanned: repositoryScanOutcomes.filter((outcome) => outcome.result).length,
    },
    dispatches,
  });
}
