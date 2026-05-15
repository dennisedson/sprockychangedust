// @workflow_state: REVIEW
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IssueAutoRefresh } from "@/components/issues/IssueAutoRefresh";
import { env } from "@/lib/env";
import { listVisibleTrackedIssues } from "@/lib/issues/trackedIssues";
import { isMissingRepositoryScanColumnError } from "@/lib/scanner/scanInstalledRepository";
import type { ScanSignal } from "@/lib/scanner/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  type CurrentWorkspaceContext,
  listCurrentWorkspaceInstallationIds,
  requireCurrentWorkspaceContext,
} from "@/lib/workspaces/currentWorkspace";

export const dynamic = "force-dynamic";

type RepositoryRow = {
  id: string;
  repo_name: string;
  is_active_for_scanning: boolean;
  monitoring_status: "pending" | "watched" | "ignored";
  has_hubspot_usage: boolean;
  latest_scan_signals: ScanSignal[] | null;
  last_scanned_at: string | null;
  created_at: string;
};

type BaseRepositoryRow = Omit<
  RepositoryRow,
  "has_hubspot_usage" | "latest_scan_signals" | "monitoring_status"
>;

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

async function getDashboardData(context: CurrentWorkspaceContext) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      repositories: [],
      changelogEntries: [],
      repositoryImpacts: [],
      trackedIssues: [],
    };
  }

  const supabase = createSupabaseAdminClient();
  const repositories = await getDashboardRepositories(context);
  const repositoryIds = repositories.map((repository) => repository.id);

  const [changelogEntriesResult, repositoryImpacts] =
    await Promise.all([
      supabase
        .from("changelog_entries")
        .select(
          "id,title,link,publication_date,status,ai_summary,ai_classification,ai_severity_level,migration_steps,impacted_keywords",
        )
        .order("publication_date", { ascending: false })
        .limit(25)
        .returns<ChangelogEntryRow[]>(),
      getDashboardRepositoryImpacts(repositoryIds),
    ]);

  if (changelogEntriesResult.error) {
    throw changelogEntriesResult.error;
  }

  return {
    repositories,
    changelogEntries: changelogEntriesResult.data,
    repositoryImpacts,
    trackedIssues: await listVisibleTrackedIssues({ repositoryIds }),
  };
}

async function getDashboardRepositories(context: CurrentWorkspaceContext) {
  const installationIds = await listCurrentWorkspaceInstallationIds(context);

  if (installationIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installed_repositories")
    .select(
      "id,repo_name,is_active_for_scanning,monitoring_status,has_hubspot_usage,latest_scan_signals,last_scanned_at,created_at",
    )
    .in("installation_id", installationIds)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<RepositoryRow[]>();

  if (!error) {
    return data;
  }

  if (isMissingMonitoringStatusColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("installed_repositories")
      .select(
        "id,repo_name,is_active_for_scanning,has_hubspot_usage,latest_scan_signals,last_scanned_at,created_at",
      )
      .in("installation_id", installationIds)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<Omit<RepositoryRow, "monitoring_status">[]>();

    if (fallbackError) {
      throw fallbackError;
    }

    return fallbackData.map((repo) => ({
      ...repo,
      monitoring_status: repo.has_hubspot_usage ? "watched" as const : "pending" as const,
    }));
  }

  if (isMissingRepositoryScanColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("installed_repositories")
      .select("id,repo_name,is_active_for_scanning,last_scanned_at,created_at")
      .in("installation_id", installationIds)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<BaseRepositoryRow[]>();

    if (fallbackError) {
      throw fallbackError;
    }

    return fallbackData.map((repo) => ({
      ...repo,
      monitoring_status: "watched" as const,
      has_hubspot_usage: false,
      latest_scan_signals: null,
    }));
  }

  throw error;
}

async function getDashboardRepositoryImpacts(repositoryIds: string[]) {
  if (repositoryIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("repository_impacts")
    .select(
      "id,changelog_entry_id,installed_repository_id,has_hubspot_usage,scan_signals,created_at",
    )
    .in("installed_repository_id", repositoryIds)
    .order("created_at", { ascending: false })
    .limit(75)
    .returns<RepositoryImpactRow[]>();

  if (error) {
    throw error;
  }

  return data;
}

function isMissingMonitoringStatusColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.message?.includes("monitoring_status") ||
    false
  );
}

export default async function DashboardPage() {
  const context = await requireCurrentWorkspaceContext();
  const dashboardData = await getDashboardData(context);

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
