import { createImpactIssue } from "@/lib/notifications/githubIssue";
import { sendImpactAlertEmail } from "@/lib/notifications/email";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { scanInstalledRepository } from "@/lib/scanner/scanInstalledRepository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RepositoryRow = {
  id: string;
  installation_id: number;
  repo_name: string;
  is_active_for_scanning: boolean;
};

type ChangelogEntryRow = {
  id: string;
  title: string;
  link: string;
  ai_summary: string;
  ai_severity_level: "red" | "amber" | "green";
  migration_steps: string[] | null;
};

export async function dispatchImpactNotifications(changelogEntryId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: entry, error: entryError } = await supabase
    .from("changelog_entries")
    .select("id,title,link,ai_summary,ai_severity_level,migration_steps")
    .eq("id", changelogEntryId)
    .single<ChangelogEntryRow>();

  if (entryError) {
    throw entryError;
  }

  const { data: repositories, error: repositoryError } = await supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name,is_active_for_scanning")
    .eq("is_active_for_scanning", true)
    .returns<RepositoryRow[]>();

  if (repositoryError) {
    throw repositoryError;
  }

  const notifiedRepositories: string[] = [];
  const settings = await getNotificationSettings();

  for (const repository of repositories) {
    const [owner, repo] = repository.repo_name.split("/");

    if (!owner || !repo) {
      continue;
    }

    const result = await scanInstalledRepository(repository);

    await supabase.from("repository_impacts").insert({
      changelog_entry_id: entry.id,
      installed_repository_id: repository.id,
      has_hubspot_usage: result.hasHubSpotUsage,
      scan_signals: result.signals,
    });

    if (!result.hasHubSpotUsage) {
      continue;
    }

    if (settings.notifyViaEmail && settings.emailAddress) {
      await sendImpactAlertEmail({
        to: settings.emailAddress,
        changelogTitle: entry.title,
        changelogUrl: entry.link,
        severity: entry.ai_severity_level,
        summary: entry.ai_summary,
        repositoryName: repository.repo_name,
        signals: result.signals,
      });
    }

    if (settings.notifyViaGithubIssue) {
      await createImpactIssue({
        installationId: repository.installation_id,
        owner,
        repo,
        changelogTitle: entry.title,
        changelogUrl: entry.link,
        summary: entry.ai_summary,
        severity: entry.ai_severity_level,
        migrationSteps: entry.migration_steps || [],
        signals: result.signals,
      });
    }

    notifiedRepositories.push(repository.repo_name);
  }

  const { error: statusError } = await supabase
    .from("changelog_entries")
    .update({ status: "notified" })
    .eq("id", changelogEntryId);

  if (statusError) {
    throw statusError;
  }

  return { notifiedRepositories };
}
