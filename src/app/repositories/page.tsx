// @workflow_state: REVIEW
import { ExternalLink, Github, Plus, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IssueAutoRefresh } from "@/components/issues/IssueAutoRefresh";
import { RepositoryActionButton } from "@/components/repositories/RepositoryActionButton";
import { RepositoryRemoveButton } from "@/components/repositories/RepositoryRemoveButton";
import { RepositorySetupScanStarter } from "@/components/repositories/RepositorySetupScanStarter";
import { RepositoryUsageModal } from "@/components/repositories/RepositoryUsageModal";
import { SuggestedIssueCreateButton } from "@/components/repositories/SuggestedIssueCreateButton";
import {
  listVisibleTrackedIssues,
  type TrackedIssueDisplay,
} from "@/lib/issues/trackedIssues";
import {
  disconnectRepositoryAction,
  ignoreRepositoryAction,
  reconnectRepositoryAction,
  scanAllRepositoriesAction,
  scanRepositoryAction,
  watchRepositoryAction,
} from "@/app/repositories/actions";
import { env } from "@/lib/env";
import { getGitHubInstallUrl } from "@/lib/github/app";
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
  monitoring_status: MonitoringStatus;
  has_hubspot_usage: boolean;
  latest_scan_signals: ScanSignal[] | null;
  last_scan_error: string | null;
  last_scanned_at: string | null;
  scan_status: ScanStatus;
  created_at: string;
};

type MonitoringStatus = "pending" | "watched" | "ignored";
type ScanStatus = "pending" | "scanning" | "complete" | "failed";
type RepositoryFilter = "hubspot" | "ignored" | "all";
type RepositoriesPageProps = {
  searchParams?: Promise<{
    filter?: string;
    githubSync?: string;
    installationId?: string;
    syncId?: string;
  }>;
};

type BaseRepositoryRow = Omit<
  RepositoryRow,
  | "has_hubspot_usage"
  | "last_scan_error"
  | "latest_scan_signals"
  | "monitoring_status"
  | "scan_status"
>;

type IssueSuggestion = {
  id: string;
  changelogEntryId: string;
  installedRepositoryId: string;
  changelogTitle: string;
  changelogUrl: string;
  severity: "red" | "amber" | "green" | null;
  confidence: number | null;
};

type RepositoryImpactSuggestionRow = {
  id: string;
  changelog_entry_id: string;
  installed_repository_id: string;
  match_confidence: number | null;
  changelog_entries: {
    title: string;
    link: string;
    ai_severity_level: "red" | "amber" | "green" | null;
  } | null;
};

async function getRepositories(context: CurrentWorkspaceContext) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const installationIds = await listCurrentWorkspaceInstallationIds(context);

  if (installationIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installed_repositories")
    .select(
      "id,repo_name,is_active_for_scanning,monitoring_status,has_hubspot_usage,latest_scan_signals,last_scan_error,last_scanned_at,scan_status,created_at",
    )
    .in("installation_id", installationIds)
    .order("created_at", { ascending: false })
    .returns<RepositoryRow[]>();

  if (error) {
    if (isMissingRepositoryScanStatusColumnError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("installed_repositories")
        .select(
          "id,repo_name,is_active_for_scanning,monitoring_status,has_hubspot_usage,latest_scan_signals,last_scanned_at,created_at",
        )
        .in("installation_id", installationIds)
        .order("created_at", { ascending: false })
        .returns<Omit<RepositoryRow, "last_scan_error" | "scan_status">[]>();

      if (fallbackError) {
        throw fallbackError;
      }

      return fallbackData.map((repo) => ({
        ...repo,
        last_scan_error: null,
        scan_status: getFallbackScanStatus(repo.last_scanned_at),
      }));
    }

    if (isMissingMonitoringStatusColumnError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("installed_repositories")
        .select(
          "id,repo_name,is_active_for_scanning,has_hubspot_usage,latest_scan_signals,last_scan_error,last_scanned_at,scan_status,created_at",
        )
        .in("installation_id", installationIds)
        .order("created_at", { ascending: false })
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
        .returns<BaseRepositoryRow[]>();

      if (fallbackError) {
        throw fallbackError;
      }

      return fallbackData.map((repo) => ({
        ...repo,
        monitoring_status: "watched" as const,
        has_hubspot_usage: false,
        last_scan_error: null,
        latest_scan_signals: null,
        scan_status: getFallbackScanStatus(repo.last_scanned_at),
      }));
    }

    throw error;
  }

  return data;
}

export default async function RepositoriesPage({ searchParams }: RepositoriesPageProps) {
  const params = await searchParams;
  const activeFilter = normalizeRepositoryFilter(params?.filter);
  const context = await requireCurrentWorkspaceContext();
  const repositories = await getRepositories(context);
  const visibleRepositories = filterRepositories(repositories, activeFilter);
  const repositoryIds = repositories.map((repository) => repository.id);
  const trackedIssues = await listVisibleTrackedIssues({ repositoryIds });
  const issueSuggestions = await listIssueSuggestions(repositoryIds);
  const setupInstallationId = normalizeInstallationId(params?.installationId);
  const pendingScanCount = repositories.filter(
    (repo) => repo.is_active_for_scanning && repo.scan_status === "pending",
  ).length;
  const hasPendingScans = repositories.some((repo) =>
    repo.is_active_for_scanning && ["pending", "scanning"].includes(repo.scan_status),
  );

  return (
    <DashboardShell active="Repositories">
      <div className="pageHeader">
        <div>
          <h1>Connected GitHub Repositories</h1>
          <p>Manage source code connections and automated scanning preferences.</p>
        </div>
        <div className="pageActions">
          <form action={scanAllRepositoriesAction}>
            <RepositoryActionButton icon="scan" label="Run Scan Now" pendingLabel="Scanning..." />
          </form>
          <a className="button" href={getGitHubInstallUrl()}>
            <Plus size={17} />
            Connect New Repository
          </a>
        </div>
      </div>

      <GitHubSetupBanner githubSync={params?.githubSync} hasPendingScans={hasPendingScans} />
      <ScanQueueBanner githubSync={params?.githubSync} pendingScanCount={pendingScanCount} />

      <section className="card tableTools">
        <label className="tableSearch">
          <Search size={18} />
          <span className="sr-only">Search repositories</span>
          <input placeholder="Search repositories..." />
        </label>
        <div className="repoFilterTabs" aria-label="Filter repositories">
          {getRepositoryFilterOptions(repositories).map((option) => (
            <a
              aria-current={activeFilter === option.value ? "page" : undefined}
              className="repoFilterTab"
              data-active={activeFilter === option.value}
              href={getRepositoryFilterHref(option.value)}
              key={option.value}
            >
              <span>{option.label}</span>
              <strong>{option.count}</strong>
            </a>
          ))}
        </div>
        <span>Showing {visibleRepositories.length} repositories</span>
      </section>

      {repositories.length === 0 ? (
        <section className="card emptyState">
          <Github size={34} />
          <h2>No repositories connected yet</h2>
          <p>
            If you just installed the GitHub App, confirm the webhook delivered in
            Vercel logs or use the GitHub App setup URL to sync the installation.
          </p>
          <a className="button" href={getGitHubInstallUrl()}>
            <Plus size={17} />
            Connect Repository
          </a>
        </section>
      ) : visibleRepositories.length === 0 ? (
        <section className="card emptyState">
          <Github size={34} />
          <h2>No repositories match this filter</h2>
          <p>Switch filters to review connected, ignored, or detected HubSpot repositories.</p>
        </section>
      ) : (
        <section className="card repoTable" aria-label="Connected repositories">
          <div className="repoTableHead">
            <span>Repository Name</span>
            <span>Status</span>
            <span>Last Scanned</span>
            <span>HubSpot Usage</span>
            <span>Issue Review</span>
            <span>Actions</span>
          </div>
          {visibleRepositories.map((repo) => (
            <article className="repoRow" key={repo.id}>
              <div className="repoName">
                <span className="repoIcon">
                  <Github size={18} />
                </span>
                <a
                  className="repoLink"
                  href={getGitHubRepositoryUrl(repo.repo_name)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <strong>{repo.repo_name}</strong>
                  <ExternalLink className="repoExternalIcon" size={13} />
                </a>
              </div>
              <StatusCell repository={repo} />
              <span className="lastScanCell">
                {formatLastScanned(repo.last_scanned_at, repo.scan_status)}
              </span>
              <div className="usageCell">
                <ScanResultCell repository={repo} />
              </div>
              <IssueReviewCell
                issueSuggestions={issueSuggestions}
                repository={repo}
                trackedIssues={trackedIssues}
              />
              <RepositoryActionsCell repository={repo} />
            </article>
          ))}
        </section>
      )}
      <IssueAutoRefresh />
      <RepositorySetupScanStarter
        installationId={setupInstallationId}
        pendingScanCount={pendingScanCount}
        syncId={params?.syncId || null}
      />
    </DashboardShell>
  );
}

function ScanQueueBanner({
  githubSync,
  pendingScanCount,
}: {
  githubSync: string | undefined;
  pendingScanCount: number;
}) {
  if (githubSync === "success" || pendingScanCount === 0) {
    return null;
  }

  return (
    <section className="statusBanner" role="status">
      <span aria-hidden="true" className="spinner" />
      <div>
        <strong>Repository scan queue is running.</strong>
        <span>
          {pendingScanCount} {pendingScanCount === 1 ? "repository is" : "repositories are"} queued.
        </span>
      </div>
    </section>
  );
}

function GitHubSetupBanner({
  githubSync,
  hasPendingScans,
}: {
  githubSync: string | undefined;
  hasPendingScans: boolean;
}) {
  if (githubSync === "error") {
    return (
      <section className="statusBanner error" role="status">
        <strong>GitHub sync did not finish.</strong>
        <span>Refresh this page or reconnect the GitHub App if the repository does not appear.</span>
      </section>
    );
  }

  if (githubSync === "missing") {
    return (
      <section className="statusBanner error" role="status">
        <strong>GitHub did not return an installation ID.</strong>
        <span>Try the GitHub App setup flow again.</span>
      </section>
    );
  }

  if (githubSync !== "success") {
    return null;
  }

  return (
    <section className="statusBanner" role="status">
      <span aria-hidden="true" className="spinner" />
      <div>
        <strong>Repository connection received.</strong>
        <span>
          {hasPendingScans
            ? "Sprocky is syncing GitHub and running the baseline scan."
            : "Sprocky synced GitHub. Review the repository states below."}
        </span>
      </div>
      <a href="/repositories">Dismiss</a>
    </section>
  );
}

async function listIssueSuggestions(repositoryIds: string[]) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  if (repositoryIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("repository_impacts")
    .select(
      "id,changelog_entry_id,installed_repository_id,match_confidence,changelog_entries(title,link,ai_severity_level)",
    )
    .eq("has_hubspot_usage", true)
    .in("installed_repository_id", repositoryIds)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<RepositoryImpactSuggestionRow[]>();

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    changelogEntryId: row.changelog_entry_id,
    installedRepositoryId: row.installed_repository_id,
    changelogTitle: row.changelog_entries?.title || "Unknown changelog",
    changelogUrl: row.changelog_entries?.link || "#",
    severity: row.changelog_entries?.ai_severity_level || null,
    confidence: row.match_confidence,
  }));
}

function IssueReviewCell({
  issueSuggestions,
  repository,
  trackedIssues,
}: {
  issueSuggestions: IssueSuggestion[];
  repository: RepositoryRow;
  trackedIssues: TrackedIssueDisplay[];
}) {
  const issues = trackedIssues.filter((issue) => issue.installedRepositoryId === repository.id);
  const trackedChangelogEntryIds = new Set(issues.map((issue) => issue.changelogEntryId));
  const suggestions = issueSuggestions.filter(
    (suggestion) =>
      suggestion.installedRepositoryId === repository.id &&
      !trackedChangelogEntryIds.has(suggestion.changelogEntryId),
  );

  if (suggestions.length === 0 && issues.length === 0) {
    return <span className="mutedCellText">No suggested issues</span>;
  }

  return (
    <details className="issueDisclosure">
      <summary>
        <span className={suggestions.length > 0 ? "badge orange" : "badge"}>
          {suggestions.length > 0
            ? `${suggestions.length} suggested`
            : `${issues.length} tracked`}
        </span>
      </summary>
      <div className="issueDisclosureList">
        {suggestions.map((suggestion) => (
          <article className="issueSuggestionItem" key={suggestion.id}>
            <a href={suggestion.changelogUrl} rel="noreferrer" target="_blank">
              <span>{suggestion.changelogTitle}</span>
              <small>{formatSuggestionMeta(suggestion)}</small>
            </a>
            <SuggestedIssueCreateButton
              changelogEntryId={suggestion.changelogEntryId}
              repositoryId={repository.id}
            />
          </article>
        ))}
        {issues.map((issue) => (
          <a href={issue.issueUrl} key={issue.id} rel="noreferrer" target="_blank">
            <span>{issue.changelogTitle}</span>
            <strong>#{issue.issueNumber}</strong>
            <small>
              {issue.issueState}
              {" · "}
              {issue.assignees.length > 0 ? issue.assignees.join(", ") : "Unassigned"}
            </small>
          </a>
        ))}
      </div>
    </details>
  );
}

function StatusCell({ repository }: { repository: RepositoryRow }) {
  return (
    <div className="statusCell">
      {!repository.is_active_for_scanning ? <span className="badge">Disconnected</span> : null}
      {isNewRepository(repository.created_at) ? <span className="badge green">New</span> : null}
      <ScanStatusBadge repository={repository} />
      <MonitoringBadge repository={repository} />
    </div>
  );
}

function RepositoryActionsCell({ repository }: { repository: RepositoryRow }) {
  const action = repository.is_active_for_scanning
    ? disconnectRepositoryAction
    : reconnectRepositoryAction;

  return (
    <div className="repoActions">
      <form action={scanRepositoryAction}>
        <input name="repositoryId" type="hidden" value={repository.id} />
        <RepositoryActionButton
          disabled={!repository.is_active_for_scanning}
          icon="scan"
          iconOnly
          label="Scan"
          pendingLabel="Scanning..."
          size="small"
        />
      </form>
      <MonitoringAction repository={repository} />
      <form action={action}>
        <input name="repositoryId" type="hidden" value={repository.id} />
        <RepositoryActionButton
          icon={repository.is_active_for_scanning ? "disconnect" : "reconnect"}
          iconOnly
          label={repository.is_active_for_scanning ? "Disconnect" : "Reconnect"}
          pendingLabel={repository.is_active_for_scanning ? "Disconnecting..." : "Reconnecting..."}
          size="small"
          tone={repository.is_active_for_scanning ? "danger" : "default"}
        />
      </form>
      <RepositoryRemoveButton repositoryId={repository.id} repositoryName={repository.repo_name} />
    </div>
  );
}

function ScanResultCell({ repository }: { repository: RepositoryRow }) {
  const signals = repository.latest_scan_signals || [];

  if (repository.scan_status === "scanning") {
    return (
      <span className="badge orange">
        <span aria-hidden="true" className="spinner miniSpinner" />
        Scanning
      </span>
    );
  }

  if (repository.scan_status === "pending" && !repository.last_scanned_at) {
    return <span className="badge orange">Pending scan</span>;
  }

  if (repository.scan_status === "failed") {
    return <span className="badge red" title={repository.last_scan_error || undefined}>Failed</span>;
  }

  if (!repository.last_scanned_at) {
    return <span className="badge">Pending</span>;
  }

  if (!repository.has_hubspot_usage) {
    return <span className="badge">No signal</span>;
  }

  return (
    <RepositoryUsageModal repositoryName={repository.repo_name} signals={signals} />
  );
}

function ScanStatusBadge({ repository }: { repository: RepositoryRow }) {
  if (repository.scan_status === "scanning") {
    return (
      <span className="badge orange">
        <span aria-hidden="true" className="spinner miniSpinner" />
        Scanning
      </span>
    );
  }

  if (repository.scan_status === "pending" && !repository.last_scanned_at) {
    return <span className="badge orange">Scan queued</span>;
  }

  if (repository.scan_status === "failed") {
    return <span className="badge red">Scan failed</span>;
  }

  return null;
}

function MonitoringBadge({ repository }: { repository: RepositoryRow }) {
  if (
    !repository.has_hubspot_usage &&
    ["pending", "scanning", "failed"].includes(repository.scan_status)
  ) {
    return null;
  }

  if (!repository.has_hubspot_usage) {
    return <span className="badge">No signal</span>;
  }

  if (repository.monitoring_status === "watched") {
    return <span className="badge green">Watched</span>;
  }

  if (repository.monitoring_status === "ignored") {
    return <span className="badge">Ignored</span>;
  }

  return <span className="badge orange">Review</span>;
}

function MonitoringAction({ repository }: { repository: RepositoryRow }) {
  if (!repository.has_hubspot_usage) {
    return null;
  }

  if (repository.monitoring_status === "watched") {
    return (
      <form action={ignoreRepositoryAction}>
        <input name="repositoryId" type="hidden" value={repository.id} />
        <RepositoryActionButton
          disabled={!repository.is_active_for_scanning}
          icon="ignore"
          iconOnly
          label="Ignore"
          pendingLabel="Ignoring..."
          size="small"
          tone="danger"
        />
      </form>
    );
  }

  return (
    <form action={watchRepositoryAction}>
      <input name="repositoryId" type="hidden" value={repository.id} />
      <RepositoryActionButton
        disabled={!repository.is_active_for_scanning}
        icon="watch"
        iconOnly
        label="Watch and check"
        pendingLabel="Checking..."
        size="small"
      />
    </form>
  );
}

function filterRepositories(repositories: RepositoryRow[], activeFilter: RepositoryFilter) {
  if (activeFilter === "all") {
    return repositories;
  }

  if (activeFilter === "ignored") {
    return repositories.filter((repository) => repository.monitoring_status === "ignored");
  }

  return repositories.filter(
    (repository) =>
      repository.has_hubspot_usage && repository.monitoring_status !== "ignored",
  );
}

function getRepositoryFilterOptions(repositories: RepositoryRow[]) {
  return [
    {
      label: "HubSpot related",
      value: "hubspot" as const,
      count: filterRepositories(repositories, "hubspot").length,
    },
    {
      label: "Ignored",
      value: "ignored" as const,
      count: filterRepositories(repositories, "ignored").length,
    },
    {
      label: "All",
      value: "all" as const,
      count: repositories.length,
    },
  ];
}

function getRepositoryFilterHref(filter: RepositoryFilter) {
  return filter === "hubspot" ? "/repositories" : `/repositories?filter=${filter}`;
}

function normalizeRepositoryFilter(value: string | undefined): RepositoryFilter {
  if (value === "ignored" || value === "all") {
    return value;
  }

  return "hubspot";
}

function getGitHubRepositoryUrl(repositoryName: string) {
  return `https://github.com/${repositoryName}`;
}

function formatSuggestionMeta(suggestion: IssueSuggestion) {
  const severity = suggestion.severity ? `Severity: ${suggestion.severity}` : "Impact detected";
  const confidence =
    typeof suggestion.confidence === "number"
      ? ` · ${Math.round(suggestion.confidence * 100)}% confidence`
      : "";

  return `${severity}${confidence}`;
}

function isMissingMonitoringStatusColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.message?.includes("monitoring_status") ||
    false
  );
}

function formatLastScanned(value: string | null, scanStatus: ScanStatus) {
  if (scanStatus === "scanning") {
    return "Scanning now";
  }

  if (scanStatus === "pending" && !value) {
    return "Queued";
  }

  if (scanStatus === "failed" && !value) {
    return "Scan failed";
  }

  if (!value) {
    return "Not scanned yet";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function getFallbackScanStatus(lastScannedAt: string | null): ScanStatus {
  return lastScannedAt ? "complete" : "pending";
}

function isMissingRepositoryScanStatusColumnError(error: { code?: string; message?: string }) {
  return (
    error.message?.includes("scan_status") ||
    error.message?.includes("last_scan_error") ||
    false
  );
}

function normalizeInstallationId(value: string | undefined) {
  const installationId = Number(value);

  if (!Number.isFinite(installationId) || installationId <= 0) {
    return null;
  }

  return installationId;
}

function isNewRepository(value: string) {
  const createdAt = new Date(value).getTime();
  const newRepositoryWindowMs = 30 * 60 * 1000;

  return Number.isFinite(createdAt) && Date.now() - createdAt < newRepositoryWindowMs;
}
