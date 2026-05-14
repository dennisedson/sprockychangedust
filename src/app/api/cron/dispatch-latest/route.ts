import { NextResponse } from "next/server";
import { dispatchImpactNotifications } from "@/lib/notifications/dispatch";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChangelogEntryRow = {
  id: string;
  title: string;
  link: string;
  publication_date: string;
  status: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: entry, error } = await supabase
    .from("changelog_entries")
    .select("id,title,link,publication_date,status")
    .in("status", ["analyzed", "notified"])
    .order("publication_date", { ascending: false })
    .limit(1)
    .maybeSingle<ChangelogEntryRow>();

  if (error) {
    throw error;
  }

  if (!entry) {
    return NextResponse.json(
      { error: "No analyzed changelog entry is available to dispatch." },
      { status: 404 },
    );
  }

  const dispatch = await dispatchImpactNotifications(entry.id);

  return NextResponse.json({
    dispatchedEntry: entry,
    dispatch,
  });
}
