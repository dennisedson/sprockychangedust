// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import { enqueueRepositoryImpactBatch } from "@/lib/ai/repositoryImpactBatch";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChangelogEntryRow = {
  id: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const explicitChangelogEntryId = requestUrl.searchParams.get("changelogEntryId");
  const changelogEntryId = explicitChangelogEntryId || (await getLatestChangelogEntryId());

  if (!changelogEntryId) {
    return NextResponse.json(
      { error: "No analyzed changelog entry is available for batch analysis." },
      { status: 404 },
    );
  }

  const result = await enqueueRepositoryImpactBatch(changelogEntryId);

  return NextResponse.json({
    changelogEntryId,
    ...result,
  });
}

async function getLatestChangelogEntryId() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("changelog_entries")
    .select("id")
    .in("status", ["analyzed", "notified"])
    .order("publication_date", { ascending: false })
    .limit(1)
    .maybeSingle<ChangelogEntryRow>();

  if (error) {
    throw error;
  }

  return data?.id;
}
