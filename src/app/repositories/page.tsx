import { Github, Plus, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { env } from "@/lib/env";
import { getGitHubInstallUrl } from "@/lib/github/app";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RepositoryRow = {
  id: string;
  installation_id: number;
  repo_name: string;
  is_active_for_scanning: boolean;
  last_scanned_at: string | null;
  created_at: string;
};

async function getRepositories() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name,is_active_for_scanning,last_scanned_at,created_at")
    .order("created_at", { ascending: false })
    .returns<RepositoryRow[]>();

  if (error) {
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
        <a className="button" href={getGitHubInstallUrl()}>
          <Plus size={17} />
          Connect New Repository
        </a>
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
            <span>Deep Scan Active</span>
          </div>
          {repositories.map((repo) => (
            <article className="repoRow" key={repo.id}>
              <div className="repoName">
                <span className="repoIcon">
                  <Github size={18} />
                </span>
                <strong>{repo.repo_name}</strong>
              </div>
              <span className="badge">inst_{repo.installation_id}</span>
              <span>{formatLastScanned(repo.last_scanned_at)}</span>
              <span className="toggleCell">
                <button
                  aria-label={`Toggle scanning for ${repo.repo_name}`}
                  className="toggle"
                  data-active={repo.is_active_for_scanning}
                  type="button"
                />
                {repo.is_active_for_scanning ? "On" : "Off"}
              </span>
            </article>
          ))}
        </section>
      )}
    </DashboardShell>
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
