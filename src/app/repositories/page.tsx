import { Github, Plus, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

const repositories = [
  {
    name: "hubspot/hubspot-cms-react",
    installationId: "inst_8472910",
    lastScanned: "May 12, 2026, 10:23 AM",
    enabled: true,
  },
  {
    name: "acme-corp/marketing-theme",
    installationId: "inst_8472910",
    lastScanned: "May 11, 2026, 04:15 PM",
    enabled: false,
  },
  {
    name: "acme-corp/crm-sync-worker",
    installationId: "inst_8472910",
    lastScanned: "May 10, 2026, 09:00 AM",
    enabled: true,
  },
  {
    name: "sprocky-inc/changedust-core",
    installationId: "inst_1129304",
    lastScanned: "May 12, 2026, 11:45 AM",
    enabled: true,
  },
  {
    name: "sprocky-inc/docs-site",
    installationId: "inst_1129304",
    lastScanned: "May 08, 2026, 02:30 PM",
    enabled: false,
  },
];

export default function RepositoriesPage() {
  return (
    <DashboardShell active="Repositories">
      <div className="pageHeader">
        <div>
          <h1>Connected GitHub Repositories</h1>
          <p>Manage source code connections and automated scanning preferences.</p>
        </div>
        <a className="button" href={process.env.GITHUB_APP_INSTALL_URL || "#"}>
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

      <section className="card repoTable" aria-label="Connected repositories">
        <div className="repoTableHead">
          <span>Repository Name</span>
          <span>GitHub Installation ID</span>
          <span>Last Scanned</span>
          <span>Deep Scan Active</span>
        </div>
        {repositories.map((repo) => (
          <article className="repoRow" key={repo.name}>
            <div className="repoName">
              <span className="repoIcon">
                <Github size={18} />
              </span>
              <strong>{repo.name}</strong>
            </div>
            <span className="badge">{repo.installationId}</span>
            <span>{repo.lastScanned}</span>
            <span className="toggleCell">
              <button
                aria-label={`Toggle scanning for ${repo.name}`}
                className="toggle"
                data-active={repo.enabled}
                type="button"
              />
              {repo.enabled ? "On" : "Off"}
            </span>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
