// @workflow_state: REVIEW
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenText,
  ExternalLink,
  Github,
} from "lucide-react";
import type { ScanSignal } from "@/lib/scanner/types";
import { SeverityBadge } from "@/components/dashboard/SeverityBadge";
import styles from "./DashboardOverview.module.css";

type Repository = {
  id: string;
  repo_name: string;
  is_active_for_scanning: boolean;
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

type DashboardOverviewProps = {
  repositories: Repository[];
  changelogEntries: ChangelogEntry[];
  repositoryImpacts: RepositoryImpact[];
};

export function DashboardOverview({
  repositories,
  changelogEntries,
  repositoryImpacts,
}: DashboardOverviewProps) {
  const activeRepositories = repositories.filter((repo) => repo.is_active_for_scanning);
  const hubSpotRepositories = repositories.filter((repo) => repo.has_hubspot_usage);
  const criticalChangelogs = changelogEntries.filter(
    (entry) => entry.ai_severity_level === "red",
  );
  const [activePanel, setActivePanel] = useState<DashboardPanel>(
    changelogEntries.length > 0 ? "changelogs" : "repositories",
  );

  const stats = [
    {
      id: "repositories" as const,
      title: "Connected Repositories",
      value: activeRepositories.length.toString(),
      helper: `${hubSpotRepositories.length} with HubSpot signals`,
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
    {
      id: "changelogs" as const,
      title: "Changelog Entries",
      value: changelogEntries.length.toString(),
      helper: getLatestChangelogHelper(changelogEntries),
      icon: BookOpenText,
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
          />
        ) : null}
        {activePanel === "changelogs" ? (
          <ChangelogPanel
            changelogEntries={changelogEntries}
            repositories={repositories}
            repositoryImpacts={repositoryImpacts}
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
                  {repo.is_active_for_scanning ? "Linked" : "Disconnected"} ·{" "}
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
}: {
  changelogEntries: ChangelogEntry[];
  repositories: Repository[];
  repositoryImpacts: RepositoryImpact[];
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
        />
      )}
    </>
  );
}

function ChangelogPanel({
  changelogEntries,
  repositories,
  repositoryImpacts,
}: {
  changelogEntries: ChangelogEntry[];
  repositories: Repository[];
  repositoryImpacts: RepositoryImpact[];
}) {
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
        <EntryList
          changelogEntries={changelogEntries}
          repositories={repositories}
          repositoryImpacts={repositoryImpacts}
        />
      )}
    </>
  );
}

function EntryList({
  changelogEntries,
  repositories,
  repositoryImpacts,
}: {
  changelogEntries: ChangelogEntry[];
  repositories: Repository[];
  repositoryImpacts: RepositoryImpact[];
}) {
  return (
    <div className={styles.entryList}>
      {changelogEntries.slice(0, 8).map((entry) => {
        const matchedRepos = getMatchedRepositories(entry.id, repositories, repositoryImpacts);
        const severity = entry.ai_severity_level || "green";

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
            </div>
            <div className={styles.repoMatches}>
              <span>{matchedRepos.length} matched repos</span>
              {matchedRepos.slice(0, 3).map((repo) => (
                <a href={getGitHubRepositoryUrl(repo.repo_name)} key={repo.id} rel="noreferrer" target="_blank">
                  {repo.repo_name}
                </a>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
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

function formatClassification(value: string | null) {
  if (!value) {
    return "unclassified";
  }

  return value.replaceAll("_", " ");
}
