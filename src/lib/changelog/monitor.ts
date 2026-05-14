import { classifyChangelogEntry } from "@/lib/ai/classifyChangelog";
import { fetchHubSpotChangelogFeed } from "@/lib/changelog/rss";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
