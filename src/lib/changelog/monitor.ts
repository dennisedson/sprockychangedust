// @workflow_state: REVIEW
import { classifyChangelogEntry } from "@/lib/ai/classifyChangelog";
import { fetchHubSpotChangelogFeed } from "@/lib/changelog/rss";
import { dispatchImpactNotifications } from "@/lib/notifications/dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type StoredChangelogEntryRow = {
  id: string;
  title: string;
  link: string;
  raw_content: string;
};

export async function runChangelogMonitor() {
  const supabase = createSupabaseAdminClient();
  const entries = await fetchHubSpotChangelogFeed();
  const processed: string[] = [];

  for (const entry of entries.slice(0, 20)) {
    const { data: existing } = await supabase
      .from("changelog_entries")
      .select("id,status")
      .eq("guid", entry.guid)
      .maybeSingle();

    if (existing?.status === "analyzed" || existing?.status === "notified") {
      continue;
    }

    const classification = await classifyChangelogEntry({
      title: entry.title,
      content: entry.rawContent,
      link: entry.link,
    });

    const { data, error } = await supabase
      .from("changelog_entries")
      .upsert(
        {
          guid: entry.guid,
          title: entry.title,
          link: entry.link,
          publication_date: entry.publicationDate,
          raw_content: entry.rawContent,
          status: "analyzed",
          ai_summary: classification.summary,
          ai_classification: classification.classification,
          ai_severity_level: classification.severity,
          migration_steps: classification.migrationSteps,
          impacted_keywords: classification.impactedKeywords,
        },
        { onConflict: "guid" },
      )
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    processed.push(data.id);
  }

  return {
    fetched: entries.length,
    analyzed: processed.length,
    analyzedEntryIds: processed,
  };
}

export async function backfillStoredChangelogEntries(options: {
  limit?: number;
  dispatch?: boolean;
  forceFreshScan?: boolean;
} = {}) {
  const supabase = createSupabaseAdminClient();
  const { data: entries, error } = await supabase
    .from("changelog_entries")
    .select("id,title,link,raw_content")
    .order("publication_date", { ascending: false })
    .limit(options.limit || 20)
    .returns<StoredChangelogEntryRow[]>();

  if (error) {
    throw error;
  }

  const analyzedEntryIds: string[] = [];
  const dispatches = [];

  for (const entry of entries) {
    const classification = await classifyChangelogEntry({
      title: entry.title,
      content: entry.raw_content,
      link: entry.link,
    });
    const { error: updateError } = await supabase
      .from("changelog_entries")
      .update({
        status: "analyzed",
        ai_summary: classification.summary,
        ai_classification: classification.classification,
        ai_severity_level: classification.severity,
        migration_steps: classification.migrationSteps,
        impacted_keywords: classification.impactedKeywords,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);

    if (updateError) {
      throw updateError;
    }

    analyzedEntryIds.push(entry.id);

    if (options.dispatch) {
      dispatches.push(
        await dispatchImpactNotifications(entry.id, {
          forceFreshScan: options.forceFreshScan,
        }),
      );
    }
  }

  return {
    analyzed: analyzedEntryIds.length,
    analyzedEntryIds,
    dispatches,
  };
}

export async function checkRepositoryAgainstStoredChangelogs(options: {
  repositoryId: string;
  limit?: number;
  forceFreshScan?: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: entries, error } = await supabase
    .from("changelog_entries")
    .select("id")
    .order("publication_date", { ascending: false })
    .limit(options.limit || 20)
    .returns<Array<{ id: string }>>();

  if (error) {
    throw error;
  }

  const dispatches = [];

  for (const entry of entries) {
    dispatches.push(
      await dispatchImpactNotifications(entry.id, {
        forceFreshScan: options.forceFreshScan,
        repositoryIds: [options.repositoryId],
      }),
    );
  }

  return {
    checked: entries.length,
    dispatches,
  };
}
