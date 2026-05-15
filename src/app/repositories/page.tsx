// @workflow_state: REVIEW
import { ExternalLink, Github, Plus, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IssueAutoRefresh } from "@/components/issues/IssueAutoRefresh";
import { TrackedIssueList } from "@/components/issues/TrackedIssueList";
import { RepositoryActionButton } from "@/components/repositories/RepositoryActionButton";
import { RepositoryUsageModal } from "@/components/repositories/RepositoryUsageModal";
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

export const dynamic = "force-dynamic";

type RepositoryRow = {
  id: string;
  repo_name: string;
  is_active_for_scanning: boolean;
  monitoring_status: MonitoringStatus;
  has_hubspot_usage: boolean;
  latest_scan_signals: ScanSignal[] | null;
  last_scanned_at: string | null;
  created_at: string;
};

type MonitoringStatus = "pending" | "watched" | "ignored";
type RepositoryFilter = "hubspot" | "ignored" | "all";
type RepositoriesPageProps = {
  searchParams?: Promise<{
    filter?: string;
  }>;
};

type BaseRepositoryRow = Omit<
  RepositoryRow,
  "has_hubspot_usage" | "latest_scan_signals" | "monitoring_status"
>;

async function getRepositories() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installed_repositories")
    .select(
      "id,repo_name,is_active_for_scanning,monitoring_status,has_hubspot_usage,latest_scan_signals,last_scanned_at,created_at",
    )
    .order("created_at", { ascending: false })
    .returns<RepositoryRow[]>();

  if (error) {
    if (isMissingMonitoringStatusColumnError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("installed_repositories")
        .select(
          "id,repo_name,is_active_for_scanning,has_hubspot_usage,latest_scan_signals,last_scanned_at,created_at",
        )
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
        .order("created_at", { ascending: false })
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

  return data;
}

export default async function RepositoriesPage({ searchParams }: RepositoriesPageProps) {
  const params = await searchParams;
  const activeFilter = normalizeRepositoryFilter(params?.filter);
  const repositories = await getRepositories();
  const visibleRepositories = filterRepositories(repositories, activeFilter);
  const trackedIssues = await listVisibleTrackedIssues();

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
            <span>Connection</span>
            <span>Last Scanned</span>
            <span>HubSpot Usage</span>
            <span>Monitoring</span>
            <span>Open Issues</span>
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
                  <span className="linkedBadge">
                    <ExternalLink size={12} />
                    GitHub
                  </span>
                </a>
              </div>
              <ConnectionCell repository={repo} />
              <span>{formatLastScanned(repo.last_scanned_at)}</span>
              <ScanResultCell repository={repo} />
              <MonitoringCell repository={repo} />
              <OpenIssuesCell repository={repo} trackedIssues={trackedIssues} />
              <div className="repoActions">
                <form action={scanRepositoryAction}>
                  <input name="repositoryId" type="hidden" value={repo.id} />
                  <RepositoryActionButton
                    disabled={!repo.is_active_for_scanning}
                    icon="scan"
                    label="Scan"
                    pendingLabel="Scanning..."
                    size="small"
                  />
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
      <IssueAutoRefresh />
    </DashboardShell>
  );
}

function OpenIssuesCell({
  repository,
  trackedIssues,
}: {
  repository: RepositoryRow;
  trackedIssues: TrackedIssueDisplay[];
}) {
  return (
    <TrackedIssueList
      emptyLabel="No open issues"
      issues={trackedIssues.filter((issue) => issue.installedRepositoryId === repository.id)}
      variant="repository"
    />
  );
}

function ConnectionCell({ repository }: { repository: RepositoryRow }) {
  const action = repository.is_active_for_scanning
    ? disconnectRepositoryAction
    : reconnectRepositoryAction;

  return (
    <div className="connectionCell">
      <span className={`badge ${repository.is_active_for_scanning ? "green" : ""}`}>
        {repository.is_active_for_scanning ? "Linked" : "Disconnected"}
      </span>
      <form action={action}>
        <input name="repositoryId" type="hidden" value={repository.id} />
        <RepositoryActionButton
          icon={repository.is_active_for_scanning ? "disconnect" : "reconnect"}
          label={repository.is_active_for_scanning ? "Disconnect" : "Reconnect"}
          pendingLabel={repository.is_active_for_scanning ? "Disconnecting..." : "Reconnecting..."}
          size="small"
          tone={repository.is_active_for_scanning ? "danger" : "default"}
        />
      </form>
    </div>
  );
}

function ScanResultCell({ repository }: { repository: RepositoryRow }) {
  const signals = repository.latest_scan_signals || [];

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

function MonitoringCell({ repository }: { repository: RepositoryRow }) {
  if (!repository.has_hubspot_usage) {
    return <span className="badge">No signal</span>;
  }

  if (repository.monitoring_status === "watched") {
    return (
      <div className="monitoringCell">
        <span className="badge green">Watched</span>
        <form action={ignoreRepositoryAction}>
          <input name="repositoryId" type="hidden" value={repository.id} />
          <RepositoryActionButton
            disabled={!repository.is_active_for_scanning}
            icon="ignore"
            label="Ignore"
            pendingLabel="Ignoring..."
            size="small"
            tone="danger"
          />
        </form>
      </div>
    );
  }

  if (repository.monitoring_status === "ignored") {
    return (
      <div className="monitoringCell">
        <span className="badge">Ignored</span>
        <form action={watchRepositoryAction}>
          <input name="repositoryId" type="hidden" value={repository.id} />
          <RepositoryActionButton
            disabled={!repository.is_active_for_scanning}
            icon="watch"
            label="Watch & check"
            pendingLabel="Checking..."
            size="small"
          />
        </form>
      </div>
    );
  }

  return (
    <div className="monitoringCell">
      <span className="badge orange">Review</span>
      <form action={watchRepositoryAction}>
        <input name="repositoryId" type="hidden" value={repository.id} />
        <RepositoryActionButton
          disabled={!repository.is_active_for_scanning}
          icon="watch"
          label="Watch & check"
          pendingLabel="Checking..."
          size="small"
        />
      </form>
      <form action={ignoreRepositoryAction}>
        <input name="repositoryId" type="hidden" value={repository.id} />
        <RepositoryActionButton
          disabled={!repository.is_active_for_scanning}
          icon="ignore"
          label="Ignore"
          pendingLabel="Ignoring..."
          size="small"
          tone="danger"
        />
      </form>
    </div>
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

function isMissingMonitoringStatusColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.message?.includes("monitoring_status") ||
    false
  );
}

function formatLastScanned(value: string | null) {
  if (!value) {
    return "Not scanned yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
