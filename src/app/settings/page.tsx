// @workflow_state: REVIEW
import { Github, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GitHubDisconnectButton } from "@/components/settings/GitHubDisconnectButton";
import { SettingsSaveButton } from "@/components/settings/SettingsSaveButton";
import { saveNotificationSettingsAction } from "@/app/settings/actions";
import { getGitHubInstallUrl } from "@/lib/github/app";
import { getGitHubInstallationSummary } from "@/lib/github/disconnect";
import { getCurrentNotificationSettings } from "@/lib/notifications/settings";
import { requireCurrentWorkspaceContext } from "@/lib/workspaces/currentWorkspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const context = await requireCurrentWorkspaceContext();
  const settings = await getCurrentNotificationSettings();
  const githubSummary = await getGitHubInstallationSummary(context);
  const wasSaved = params.saved === "1";
  const isGitHubConnected = githubSummary.activeInstallationCount > 0;

  return (
    <DashboardShell active="Settings">
      <div className="pageHeader">
        <div>
          <h1>Settings</h1>
          <p>Control where Sprocky sends confirmed changelog impact alerts.</p>
        </div>
      </div>

      <div className="settingsStack">
        <form action={saveNotificationSettingsAction} className="settingsStack">
          {wasSaved ? (
            <div className="saveStatus" role="status">
              Preferences saved.
            </div>
          ) : null}

          <section className="card settingsCard">
            <div className="settingsTitle">
              <span className="featureIcon">
                <Mail size={21} />
              </span>
              <h2>Email Notifications</h2>
            </div>
            <label className="settingToggle">
              <input
                className="toggleInput"
                defaultChecked={settings.notifyViaEmail}
                name="notifyViaEmail"
                type="checkbox"
              />
              <span className="toggleIndicator" />
              Enable email notifications for critical and warning HubSpot changelog alerts
            </label>
            <label className="field">
              Primary Notification Email Address
              <input
                className="input"
                defaultValue={settings.emailAddress || ""}
                name="emailAddress"
                placeholder="you@example.com"
                type="email"
              />
            </label>
          </section>

          <section className="card settingsCard">
            <div className="settingsTitle">
              <span className="repoIcon">
                <Github size={21} />
              </span>
              <h2>GitHub Issue Creation</h2>
            </div>
            <label className="settingToggle">
              <input
                className="toggleInput"
                defaultChecked={settings.notifyViaGithubIssue}
                name="notifyViaGithubIssue"
                type="checkbox"
              />
              <span className="toggleIndicator" />
              Automatically create GitHub issues for confirmed impacts
            </label>
            <p>
              When this is off, Sprocky will show suggested issues for confirmed
              impacts and wait for you to create them manually.
            </p>
          </section>

          <SettingsSaveButton />
        </form>

        <section className="card settingsCard">
          <div className="settingsTitle">
            <span className="repoIcon">
              <Github size={21} />
            </span>
            <h2>GitHub Connection</h2>
          </div>
          <div className="settingsIntegrationStatus">
            <span className={isGitHubConnected ? "badge green" : "badge"}>
              {isGitHubConnected ? "Connected" : "Not connected"}
            </span>
            <strong>
              {isGitHubConnected
                ? formatGitHubSummary(githubSummary)
                : "No active GitHub App installation is connected."}
            </strong>
          </div>
          <p>
            Disconnecting uninstalls the GitHub App and removes connected repository records,
            scan results, impact matches, and tracked issue records from Sprocky.
          </p>
          <div className="settingsActionRow">
            <a className="button secondary" href={getGitHubInstallUrl()}>
              Connect GitHub
            </a>
            <GitHubDisconnectButton disabled={!isGitHubConnected} />
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function formatGitHubSummary(summary: Awaited<ReturnType<typeof getGitHubInstallationSummary>>) {
  const accountText =
    summary.accountLogins.length > 0 ? summary.accountLogins.join(", ") : "unknown account";
  const installationText =
    summary.activeInstallationCount === 1
      ? "1 installation"
      : `${summary.activeInstallationCount} installations`;
  const repositoryText =
    summary.connectedRepositoryCount === 1
      ? "1 repository"
      : `${summary.connectedRepositoryCount} repositories`;

  return `${accountText} · ${installationText} · ${repositoryText}`;
}
