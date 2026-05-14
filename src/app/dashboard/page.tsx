// @workflow_state: REVIEW
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IssueAutoRefresh } from "@/components/issues/IssueAutoRefresh";
import { env } from "@/lib/env";
import { listVisibleTrackedIssues } from "@/lib/issues/trackedIssues";
import type { ScanSignal } from "@/lib/scanner/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RepositoryRow = {
  id: string;
  repo_name: string;
  is_active_for_scanning: boolean;
  has_hubspot_usage: boolean;
  latest_scan_signals: ScanSignal[] | null;
  last_scanned_at: string | null;
  created_at: string;
};

type ChangelogEntryRow = {
  id: string;
  title: string;
  link: string;
  publication_date: string;
  status: string;
  ai_summary: string | null;
  ai_classification: string | null;
  ai_severity_level: "red" | "amber" | "green" | null;
  migration_steps: string[] | null;
  impacted_keywords: string[] | null;
};

type RepositoryImpactRow = {
  id: string;
  changelog_entry_id: string;
  installed_repository_id: string;
  has_hubspot_usage: boolean;
  scan_signals: ScanSignal[] | null;
  created_at: string;
};

async function getDashboardData() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      repositories: [],
      changelogEntries: [],
      repositoryImpacts: [],
      trackedIssues: [],
    };
  }

  const supabase = createSupabaseAdminClient();

  const [repositoriesResult, changelogEntriesResult, repositoryImpactsResult] =
    await Promise.all([
      supabase
        .from("installed_repositories")
        .select(
          "id,repo_name,is_active_for_scanning,has_hubspot_usage,latest_scan_signals,last_scanned_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<RepositoryRow[]>(),
      supabase
        .from("changelog_entries")
        .select(
          "id,title,link,publication_date,status,ai_summary,ai_classification,ai_severity_level,migration_steps,impacted_keywords",
        )
        .order("publication_date", { ascending: false })
        .limit(25)
        .returns<ChangelogEntryRow[]>(),
      supabase
        .from("repository_impacts")
        .select(
          "id,changelog_entry_id,installed_repository_id,has_hubspot_usage,scan_signals,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(75)
        .returns<RepositoryImpactRow[]>(),
    ]);

  if (repositoriesResult.error) {
    throw repositoriesResult.error;
  }

  if (changelogEntriesResult.error) {
    throw changelogEntriesResult.error;
  }

  if (repositoryImpactsResult.error) {
    throw repositoryImpactsResult.error;
  }

  return {
    repositories: repositoriesResult.data,
    changelogEntries: changelogEntriesResult.data,
    repositoryImpacts: repositoryImpactsResult.data,
    trackedIssues: await listVisibleTrackedIssues(),
  };
}

export default async function DashboardPage() {
  const dashboardData = await getDashboardData();

  return (
    <DashboardShell active="Dashboard">
      <div className="pageHeader">
        <div>
          <h1>Overview</h1>
          <p>Monitor changelog impact across connected GitHub repositories.</p>
        </div>
      </div>

      <DashboardOverview {...dashboardData} />
      <IssueAutoRefresh />
    </DashboardShell>
  );
}
