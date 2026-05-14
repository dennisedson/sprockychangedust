import { Github, Plus, RotateCcw, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { RepositoryUsageModal } from "@/components/repositories/RepositoryUsageModal";
import { scanAllRepositoriesAction, scanRepositoryAction } from "@/app/repositories/actions";
import { env } from "@/lib/env";
import { getGitHubInstallUrl } from "@/lib/github/app";
import { isMissingRepositoryScanColumnError } from "@/lib/scanner/scanInstalledRepository";
import type { ScanSignal } from "@/lib/scanner/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RepositoryRow = {
  id: string;
  installation_id: number;
  repo_name: string;
  is_active_for_scanning: boolean;
  has_hubspot_usage: boolean;
  latest_scan_signals: ScanSignal[] | null;
  last_scanned_at: string | null;
  created_at: string;
};

type BaseRepositoryRow = Omit<RepositoryRow, "has_hubspot_usage" | "latest_scan_signals">;

async function getRepositories() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installed_repositories")
    .select(
      "id,installation_id,repo_name,is_active_for_scanning,has_hubspot_usage,latest_scan_signals,last_scanned_at,created_at",
    )
    .order("created_at", { ascending: false })
    .returns<RepositoryRow[]>();

  if (error) {
    if (isMissingRepositoryScanColumnError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("installed_repositories")
        .select("id,installation_id,repo_name,is_active_for_scanning,last_scanned_at,created_at")
        .order("created_at", { ascending: false })
        .returns<BaseRepositoryRow[]>();

      if (fallbackError) {
        throw fallbackError;
      }

      return fallbackData.map((repo) => ({
        ...repo,
        has_hubspot_usage: false,
        latest_scan_signals: null,
      }));
    }

    throw error;
  }

  return data;
}

export default async function RepositoriesPage() {
  const repositories = await getRepositories();

  return (
    <DashboardShell active="Repositories">
      <div className="pageHeader">
        <div>
          <h1>Connected GitHub Repositories</h1>
          <p>Manage source code connections and automated scanning preferences.</p>
        </div>
        <div className="pageActions">
          <form action={scanAllRepositoriesAction}>
            <button className="button secondary" type="submit">
              <RotateCcw size={17} />
              Run Scan Now
            </button>
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
          <input placeholder="Search repositories or installation IDs..." />
        </label>
        <span>Showing {repositories.length} repositories</span>
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
      ) : (
        <section className="card repoTable" aria-label="Connected repositories">
          <div className="repoTableHead">
            <span>Repository Name</span>
            <span>GitHub Installation ID</span>
            <span>Last Scanned</span>
            <span>HubSpot Usage</span>
            <span>Actions</span>
          </div>
          {repositories.map((repo) => (
            <article className="repoRow" key={repo.id}>
              <div className="repoName">
                <span className="repoIcon">
                  <Github size={18} />
                </span>
                <a href={getGitHubRepositoryUrl(repo.repo_name)} rel="noreferrer" target="_blank">
                  <strong>{repo.repo_name}</strong>
                </a>
              </div>
              <span className="badge">inst_{repo.installation_id}</span>
              <span>{formatLastScanned(repo.last_scanned_at)}</span>
              <ScanResultCell repository={repo} />
              <div className="repoActions">
                <span className="toggleCell">
                  <button
                    aria-label={`Toggle scanning for ${repo.repo_name}`}
                    className="toggle"
                    data-active={repo.is_active_for_scanning}
                    type="button"
                  />
                  {repo.is_active_for_scanning ? "On" : "Off"}
                </span>
                <form action={scanRepositoryAction}>
                  <input name="repositoryId" type="hidden" value={repo.id} />
                  <button className="button secondary smallButton" type="submit">
                    <RotateCcw size={15} />
                    Scan
                  </button>
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
    </DashboardShell>
  );
}

function ScanResultCell({ repository }: { repository: RepositoryRow }) {
  const signals = repository.latest_scan_signals || [];

  if (!repository.last_scanned_at) {
    return <span className="badge">Pending</span>;
  }

  if (!repository.has_hubspot_usage) {
    return <span className="badge green">No signal</span>;
  }

  return (
    <RepositoryUsageModal repositoryName={repository.repo_name} signals={signals} />
  );
}

function getGitHubRepositoryUrl(repositoryName: string) {
  return `https://github.com/${repositoryName}`;
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
