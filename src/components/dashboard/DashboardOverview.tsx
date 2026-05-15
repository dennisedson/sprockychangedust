// @workflow_state: REVIEW
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenText,
  ExternalLink,
  Github,
} from "lucide-react";
import { TrackedIssueList } from "@/components/issues/TrackedIssueList";
import type { TrackedIssueDisplay } from "@/lib/issues/trackedIssues";
import type { ScanSignal } from "@/lib/scanner/types";
import { SeverityBadge } from "@/components/dashboard/SeverityBadge";
import styles from "./DashboardOverview.module.css";

type Repository = {
  id: string;
  repo_name: string;
  is_active_for_scanning: boolean;
  monitoring_status: "pending" | "watched" | "ignored";
  has_hubspot_usage: boolean;
  latest_scan_signals: ScanSignal[] | null;
  last_scanned_at: string | null;
  created_at: string;
};

type ChangelogEntry = {
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

type RepositoryImpact = {
  id: string;
  changelog_entry_id: string;
  installed_repository_id: string;
  has_hubspot_usage: boolean;
  scan_signals: ScanSignal[] | null;
  created_at: string;
};

type DashboardPanel = "repositories" | "critical" | "changelogs";
type Severity = "red" | "amber" | "green";
type SeverityFilter = "all" | Severity;

type DashboardOverviewProps = {
  repositories: Repository[];
  changelogEntries: ChangelogEntry[];
  repositoryImpacts: RepositoryImpact[];
  trackedIssues: TrackedIssueDisplay[];
};

type IssueCreationResult = {
  createdIssues?: Array<{
    issueNumber: number;
    issueUrl: string;
    repositoryName: string;
  }>;
  existingIssues?: TrackedIssueDisplay[];
  errors?: Array<{ repositoryName: string; error: string }>;
  error?: string;
};

const severityFilterOptions: Array<{
  label: string;
  value: SeverityFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Critical", value: "red" },
  { label: "Warning", value: "amber" },
  { label: "Info", value: "green" },
];

export function DashboardOverview({
  repositories,
  changelogEntries,
  repositoryImpacts,
  trackedIssues,
}: DashboardOverviewProps) {
  const activeRepositories = repositories.filter((repo) => repo.is_active_for_scanning);
  const hubSpotRepositories = repositories.filter((repo) => repo.has_hubspot_usage);
  const watchedRepositories = repositories.filter(
    (repo) => repo.monitoring_status === "watched",
  );
  const criticalChangelogs = changelogEntries.filter(
    (entry) => entry.ai_severity_level === "red",
  );
  const [activePanel, setActivePanel] = useState<DashboardPanel>("changelogs");

  const stats = [
    {
      id: "changelogs" as const,
      title: "Changelog Entries",
      value: changelogEntries.length.toString(),
      helper: getLatestChangelogHelper(changelogEntries),
      icon: BookOpenText,
    },
    {
      id: "repositories" as const,
      title: "Connected Repositories",
      value: activeRepositories.length.toString(),
      helper: `${watchedRepositories.length} watched, ${hubSpotRepositories.length} detected`,
      icon: Github,
    },
    {
      id: "critical" as const,
      title: "Critical Alerts",
      value: criticalChangelogs.length.toString(),
      helper:
        criticalChangelogs.length === 0
          ? "No critical changelogs"
          : criticalChangelogs.length === 1
            ? "1 changelog needs review"
            : `${criticalChangelogs.length} changelogs need review`,
      icon: AlertTriangle,
    },
  ];

  return (
    <>
      <div className={styles.statsGrid}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isActive = activePanel === stat.id;

          return (
            <button
              aria-controls="dashboard-detail-panel"
              aria-pressed={isActive}
              className={styles.statCard}
              data-active={isActive}
              key={stat.id}
              onClick={() => setActivePanel(stat.id)}
              type="button"
            >
              <div>
                <p>{stat.title}</p>
                <strong>{stat.value}</strong>
                <span>
                  <ArrowUpRight size={14} />
                  {stat.helper}
                </span>
              </div>
              <Icon size={23} />
            </button>
          );
        })}
      </div>

      <section className={`card ${styles.detailPanel}`} id="dashboard-detail-panel">
        {activePanel === "repositories" ? (
          <RepositoryPanel repositories={repositories} />
        ) : null}
        {activePanel === "critical" ? (
          <CriticalPanel
            changelogEntries={criticalChangelogs}
            repositories={repositories}
            repositoryImpacts={repositoryImpacts}
            trackedIssues={trackedIssues}
          />
        ) : null}
        {activePanel === "changelogs" ? (
          <ChangelogPanel
            changelogEntries={changelogEntries}
            repositories={repositories}
            repositoryImpacts={repositoryImpacts}
            trackedIssues={trackedIssues}
          />
        ) : null}
      </section>
    </>
  );
}

function RepositoryPanel({ repositories }: { repositories: Repository[] }) {
  return (
    <>
      <DetailHeader
        actionHref="/repositories"
        actionLabel="Manage repositories"
        eyebrow="Repositories"
        title="Connected source inventory"
      />
      {repositories.length === 0 ? (
        <EmptyState message="No repositories are connected yet." />
      ) : (
        <div className={styles.detailList}>
          {repositories.slice(0, 8).map((repo) => (
            <article className={styles.detailItem} key={repo.id}>
              <span className={styles.itemIcon}>
                <Github size={18} />
              </span>
              <div className={styles.itemContent}>
                <a href={getGitHubRepositoryUrl(repo.repo_name)} rel="noreferrer" target="_blank">
                  <strong>{repo.repo_name}</strong>
                  <ExternalLink size={13} />
                </a>
                <span>
                  {getRepositoryStatusLabel(repo)} ·{" "}
                  {repo.last_scanned_at
                    ? `Last scanned ${formatDate(repo.last_scanned_at)}`
                    : "Scan pending"}
                </span>
              </div>
              <span className={`badge ${repo.has_hubspot_usage ? styles.hubSpotSignalBadge : ""}`}>
                {repo.has_hubspot_usage ? "HubSpot signal" : "No signal"}
              </span>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function CriticalPanel({
  changelogEntries,
  repositories,
  repositoryImpacts,
  trackedIssues,
}: {
  changelogEntries: ChangelogEntry[];
  repositories: Repository[];
  repositoryImpacts: RepositoryImpact[];
  trackedIssues: TrackedIssueDisplay[];
}) {
  return (
    <>
      <DetailHeader
        actionHref="/repositories"
        actionLabel="Review repos"
        eyebrow="Critical"
        title="Highest priority changelog impacts"
      />
      {changelogEntries.length === 0 ? (
        <EmptyState message="No critical changelog entries are currently classified." />
      ) : (
        <EntryList
          changelogEntries={changelogEntries}
          repositories={repositories}
          repositoryImpacts={repositoryImpacts}
          trackedIssues={trackedIssues}
        />
      )}
    </>
  );
}

function ChangelogPanel({
  changelogEntries,
  repositories,
  repositoryImpacts,
  trackedIssues,
}: {
  changelogEntries: ChangelogEntry[];
  repositories: Repository[];
  repositoryImpacts: RepositoryImpact[];
  trackedIssues: TrackedIssueDisplay[];
}) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const filteredEntries =
    severityFilter === "all"
      ? changelogEntries
      : changelogEntries.filter((entry) => getEntrySeverity(entry) === severityFilter);

  return (
    <>
      <DetailHeader
        actionHref="https://developers.hubspot.com/changelog"
        actionLabel="Open changelog"
        eyebrow="Changelog"
        title="Latest HubSpot changelog entries"
      />
      {changelogEntries.length === 0 ? (
        <EmptyState message="No changelog entries have been fetched yet." />
      ) : (
        <>
          <SeverityFilterControl
            changelogEntries={changelogEntries}
            selectedSeverity={severityFilter}
            onSelectSeverity={setSeverityFilter}
          />
          {filteredEntries.length === 0 ? (
            <EmptyState message="No changelog entries match this severity filter." />
          ) : (
            <EntryList
              changelogEntries={filteredEntries}
              repositories={repositories}
              repositoryImpacts={repositoryImpacts}
              trackedIssues={trackedIssues}
            />
          )}
        </>
      )}
    </>
  );
}

function SeverityFilterControl({
  changelogEntries,
  selectedSeverity,
  onSelectSeverity,
}: {
  changelogEntries: ChangelogEntry[];
  selectedSeverity: SeverityFilter;
  onSelectSeverity: (severity: SeverityFilter) => void;
}) {
  return (
    <div className={styles.severityFilter} aria-label="Filter changelog entries by severity">
      {severityFilterOptions.map((option) => {
        const count = getSeverityFilterCount(changelogEntries, option.value);
        const isSelected = selectedSeverity === option.value;

        return (
          <button
            aria-pressed={isSelected}
            data-active={isSelected}
            key={option.value}
            onClick={() => onSelectSeverity(option.value)}
            type="button"
          >
            <span>{option.label}</span>
            <strong>{count}</strong>
          </button>
        );
      })}
    </div>
  );
}

function EntryList({
  changelogEntries,
  repositories,
  repositoryImpacts,
  trackedIssues,
}: {
  changelogEntries: ChangelogEntry[];
  repositories: Repository[];
  repositoryImpacts: RepositoryImpact[];
  trackedIssues: TrackedIssueDisplay[];
}) {
  return (
    <div className={styles.entryList}>
      {changelogEntries.slice(0, 8).map((entry) => {
        const matchedRepos = getMatchedRepositories(entry.id, repositories, repositoryImpacts);
        const severity = getEntrySeverity(entry);
        const activeIssues = getTrackedIssuesForEntry(entry.id, trackedIssues);

        return (
          <article className={styles.entryItem} key={entry.id}>
            <div className={styles.entryMain}>
              <div className={styles.entryTitleRow}>
                <a href={entry.link} rel="noreferrer" target="_blank">
                  <strong>{entry.title}</strong>
                  <ExternalLink size={13} />
                </a>
                <SeverityBadge severity={severity} />
              </div>
              <p>{entry.ai_summary || "Classification summary is not available yet."}</p>
              <div className={styles.entryMeta}>
                <span>{formatDate(entry.publication_date)}</span>
                <span>{formatStatus(entry.status)}</span>
                <span>{formatClassification(entry.ai_classification)}</span>
              </div>
              <TrackedIssueList issues={activeIssues} variant="changelog" />
            </div>
            <div className={styles.repoMatches}>
              <span>{matchedRepos.length} matched repos</span>
              {matchedRepos.slice(0, 3).map((repo) => (
                <a
                  href={getGitHubRepositoryUrl(repo.repo_name)}
                  key={repo.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  {repo.repo_name}
                </a>
              ))}
              <IssueCreateControl changelogEntry={entry} repositories={repositories} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function IssueCreateControl({
  changelogEntry,
  repositories,
}: {
  changelogEntry: ChangelogEntry;
  repositories: Repository[];
}) {
  const router = useRouter();
  const activeRepositories = repositories.filter(
    (repo) =>
      repo.is_active_for_scanning && repo.monitoring_status === "watched",
  );
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<string[]>([]);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [result, setResult] = useState<IssueCreationResult | null>(null);
  const selectedRepositories = activeRepositories.filter((repo) =>
    selectedRepositoryIds.includes(repo.id),
  );

  async function handleCreateIssue() {
    if (selectedRepositoryIds.length === 0) {
      return;
    }

    setIsCreatingIssue(true);
    setResult(null);

    const response = await fetch("/api/issues", {
      body: JSON.stringify({
        changelogEntryId: changelogEntry.id,
        repositoryIds: selectedRepositoryIds,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json()) as IssueCreationResult;

    if (!response.ok) {
      setResult({ error: payload.error || "Issue creation failed." });
      setIsCreatingIssue(false);
      return;
    }

    setResult(payload);
    setIsCreatingIssue(false);
    router.refresh();
  }

  function handleRepositorySelection(repositoryId: string, isSelected: boolean) {
    setResult(null);
    setSelectedRepositoryIds((currentRepositoryIds) =>
      isSelected
        ? [...currentRepositoryIds, repositoryId]
        : currentRepositoryIds.filter((currentRepositoryId) => currentRepositoryId !== repositoryId),
    );
  }

  return (
    <div className={styles.issueCreateControl}>
      <span className={styles.issueCreateLabel}>Create issue in</span>
      <details className={styles.repoMultiSelect}>
        <summary>{getRepositorySelectionLabel(selectedRepositories)}</summary>
        <div className={styles.repoOptionList}>
          {activeRepositories.length === 0 ? (
            <span>No watched repositories</span>
          ) : (
            activeRepositories.map((repo) => (
              <label key={repo.id}>
                <input
                  checked={selectedRepositoryIds.includes(repo.id)}
                  disabled={isCreatingIssue}
                  onChange={(event) =>
                    handleRepositorySelection(repo.id, event.target.checked)
                  }
                  type="checkbox"
                />
                {repo.repo_name}
              </label>
            ))
          )}
        </div>
      </details>
      <button
        className={styles.issueButton}
        disabled={selectedRepositoryIds.length === 0 || isCreatingIssue}
        onClick={handleCreateIssue}
        type="button"
      >
        {getIssueButtonLabel(isCreatingIssue, selectedRepositoryIds.length)}
      </button>
      {result?.createdIssues && result.createdIssues.length > 0 ? (
        <div className={styles.issueResults}>
          {result.createdIssues.map((issue) => (
            <a href={issue.issueUrl} key={issue.issueUrl} rel="noreferrer" target="_blank">
              {issue.repositoryName} #{issue.issueNumber}
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      ) : null}
      {result?.existingIssues && result.existingIssues.length > 0 ? (
        <div className={styles.issueResults}>
          {result.existingIssues.map((issue) => (
            <a href={issue.issueUrl} key={issue.id} rel="noreferrer" target="_blank">
              {issue.repositoryName} #{issue.issueNumber} already tracked
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      ) : null}
      {result?.errors && result.errors.length > 0 ? (
        <span className={styles.issueError}>{result.errors.length} issue failed.</span>
      ) : null}
      {result?.error ? <span className={styles.issueError}>{result.error}</span> : null}
    </div>
  );
}

function getRepositorySelectionLabel(selectedRepositories: Repository[]) {
  if (selectedRepositories.length === 0) {
    return "Choose repo";
  }

  if (selectedRepositories.length === 1) {
    return selectedRepositories[0].repo_name;
  }

  return `${selectedRepositories.length} repos selected`;
}

function getIssueButtonLabel(isCreatingIssue: boolean, repositoryCount: number) {
  if (isCreatingIssue) {
    return repositoryCount > 1 ? "Creating issues..." : "Creating issue...";
  }

  return repositoryCount > 1 ? `Create ${repositoryCount} issues` : "Create issue";
}

function getSeverityFilterCount(changelogEntries: ChangelogEntry[], severity: SeverityFilter) {
  if (severity === "all") {
    return changelogEntries.length;
  }

  return changelogEntries.filter((entry) => getEntrySeverity(entry) === severity).length;
}

function getEntrySeverity(entry: ChangelogEntry): Severity {
  return entry.ai_severity_level || "green";
}

function DetailHeader({
  actionHref,
  actionLabel,
  eyebrow,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  eyebrow: string;
  title: string;
}) {
  const isExternal = actionHref.startsWith("http");

  return (
    <div className={styles.detailHeader}>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {isExternal ? (
        <a href={actionHref} rel="noreferrer" target="_blank">
          {actionLabel}
          <ExternalLink size={14} />
        </a>
      ) : (
        <a href={actionHref}>
          {actionLabel}
          <ArrowUpRight size={14} />
        </a>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className={styles.emptyState}>{message}</p>;
}

function getMatchedRepositories(
  changelogEntryId: string,
  repositories: Repository[],
  repositoryImpacts: RepositoryImpact[],
) {
  const impactedRepositoryIds = new Set(
    repositoryImpacts
      .filter(
        (impact) =>
          impact.changelog_entry_id === changelogEntryId && impact.has_hubspot_usage,
      )
      .map((impact) => impact.installed_repository_id),
  );

  return repositories.filter((repo) => impactedRepositoryIds.has(repo.id));
}

function getTrackedIssuesForEntry(
  changelogEntryId: string,
  trackedIssues: TrackedIssueDisplay[],
) {
  return trackedIssues.filter((issue) => issue.changelogEntryId === changelogEntryId);
}

function getGitHubRepositoryUrl(repositoryName: string) {
  return `https://github.com/${repositoryName}`;
}

function getLatestChangelogHelper(changelogEntries: ChangelogEntry[]) {
  const [latestEntry] = changelogEntries;

  if (!latestEntry) {
    return "Awaiting first fetch";
  }

  return `Latest ${formatDate(latestEntry.publication_date)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function formatMonitoringStatus(value: Repository["monitoring_status"]) {
  if (value === "watched") {
    return "Watched";
  }

  if (value === "ignored") {
    return "Ignored";
  }

  return "Needs review";
}

function getRepositoryStatusLabel(repository: Repository) {
  if (!repository.is_active_for_scanning) {
    return "Disconnected";
  }

  return formatMonitoringStatus(repository.monitoring_status);
}

function formatClassification(value: string | null) {
  if (!value) {
    return "unclassified";
  }

  return value.replaceAll("_", " ");
}
