// @workflow_state: REVIEW
import { Github, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SettingsSaveButton } from "@/components/settings/SettingsSaveButton";
import { saveNotificationSettingsAction } from "@/app/settings/actions";
import { getNotificationSettings } from "@/lib/notifications/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const settings = await getNotificationSettings();
  const wasSaved = params.saved === "1";

  return (
    <DashboardShell active="Settings">
      <div className="pageHeader">
        <div>
          <h1>Settings</h1>
          <p>Control where Sprocky sends confirmed changelog impact alerts.</p>
        </div>
      </div>

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
    </DashboardShell>
  );
}
