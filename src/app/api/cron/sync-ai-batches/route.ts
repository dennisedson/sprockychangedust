// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import { syncRepositoryImpactBatches } from "@/lib/ai/repositoryImpactBatch";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await syncRepositoryImpactBatches());
}
