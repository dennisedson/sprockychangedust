// @workflow_state: REVIEW
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TrackedIssueDisplay = {
  id: string;
  changelogEntryId: string;
  installedRepositoryId: string;
  repositoryName: string;
  changelogTitle: string;
  changelogUrl: string;
  severity: "red" | "amber" | "green" | null;
  issueNumber: number;
  issueUrl: string;
  issueState: "open" | "closed";
  assignees: string[];
  labels: string[];
  createdAt: string;
};

export type TrackedIssueRow = {
  id: string;
  changelog_entry_id: string;
  installed_repository_id: string;
  github_issue_number: number;
  github_issue_url: string;
  github_issue_state: "open" | "closed";
  github_issue_assignees: string[];
  github_issue_labels: string[];
  created_at: string;
  changelog_entries: {
    title: string;
    link: string;
    ai_severity_level: "red" | "amber" | "green" | null;
  } | null;
  installed_repositories: {
    repo_name: string;
  } | null;
};

export function isMissingTrackedIssuesTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.message?.includes("tracked_issues") ||
    error.message?.includes("schema cache")
  );
}

export async function listVisibleTrackedIssues() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracked_issues")
    .select(
      "id,changelog_entry_id,installed_repository_id,github_issue_number,github_issue_url,github_issue_state,github_issue_assignees,github_issue_labels,created_at,changelog_entries(title,link,ai_severity_level),installed_repositories(repo_name)",
    )
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<TrackedIssueRow[]>();

  if (error) {
    if (isMissingTrackedIssuesTableError(error)) {
      return [];
    }

    throw error;
  }

  return data.map(mapTrackedIssueRow);
}

export async function recordTrackedIssue(input: {
  changelogEntryId: string;
  installedRepositoryId: string;
  githubIssueId: number;
  githubIssueNumber: number;
  githubIssueUrl: string;
  githubIssueState: "open" | "closed";
  assignees: string[];
  labels: string[];
  closedAt: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("tracked_issues").upsert(
    {
      changelog_entry_id: input.changelogEntryId,
      installed_repository_id: input.installedRepositoryId,
      github_issue_id: input.githubIssueId,
      github_issue_number: input.githubIssueNumber,
      github_issue_url: input.githubIssueUrl,
      github_issue_state: input.githubIssueState,
      github_issue_assignees: input.assignees,
      github_issue_labels: input.labels,
      closed_at: input.closedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "github_issue_id" },
  );

  if (error) {
    throw error;
  }
}

export async function listExistingOpenTrackedIssues(input: {
  changelogEntryId: string;
  repositoryIds: string[];
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracked_issues")
    .select(
      "id,changelog_entry_id,installed_repository_id,github_issue_number,github_issue_url,github_issue_state,github_issue_assignees,github_issue_labels,created_at,changelog_entries(title,link,ai_severity_level),installed_repositories(repo_name)",
    )
    .eq("changelog_entry_id", input.changelogEntryId)
    .in("installed_repository_id", input.repositoryIds)
    .eq("github_issue_state", "open")
    .is("dismissed_at", null)
    .returns<TrackedIssueRow[]>();

  if (error) {
    throw error;
  }

  return data.map(mapTrackedIssueRow);
}

export async function dismissTrackedIssue(trackedIssueId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("tracked_issues")
    .update({
      dismissed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", trackedIssueId);

  if (error) {
    throw error;
  }
}

export async function updateTrackedIssueStateFromGitHub(input: {
  githubIssueId: number;
  issueNumber: number;
  issueUrl: string;
  issueState: "open" | "closed";
  assignees: string[];
  labels: string[];
  closedAt: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("tracked_issues")
    .update({
      github_issue_number: input.issueNumber,
      github_issue_url: input.issueUrl,
      github_issue_state: input.issueState,
      github_issue_assignees: input.assignees,
      github_issue_labels: input.labels,
      closed_at: input.closedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("github_issue_id", input.githubIssueId);

  if (error) {
    if (isMissingTrackedIssuesTableError(error)) {
      return;
    }

    throw error;
  }
}

function mapTrackedIssueRow(row: TrackedIssueRow): TrackedIssueDisplay {
  return {
    id: row.id,
    changelogEntryId: row.changelog_entry_id,
    installedRepositoryId: row.installed_repository_id,
    repositoryName: row.installed_repositories?.repo_name || "Unknown repository",
    changelogTitle: row.changelog_entries?.title || "Unknown changelog",
    changelogUrl: row.changelog_entries?.link || "#",
    severity: row.changelog_entries?.ai_severity_level || null,
    issueNumber: row.github_issue_number,
    issueUrl: row.github_issue_url,
    issueState: row.github_issue_state,
    assignees: row.github_issue_assignees || [],
    labels: row.github_issue_labels || [],
    createdAt: row.created_at,
  };
}
