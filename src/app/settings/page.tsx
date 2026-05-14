import { Github, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { saveNotificationSettingsAction } from "@/app/settings/actions";
import { getNotificationSettings } from "@/lib/notifications/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getNotificationSettings();

  return (
    <DashboardShell active="Settings">
      <div className="pageHeader">
        <div>
          <h1>Settings</h1>
          <p>Control where Sprocky sends confirmed changelog impact alerts.</p>
        </div>
      </div>

      <form action={saveNotificationSettingsAction} className="settingsStack">
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
            <h2>GitHub Issue Notifications</h2>
          </div>
          <label className="settingToggle">
            <input
              className="toggleInput"
              defaultChecked={settings.notifyViaGithubIssue}
              name="notifyViaGithubIssue"
              type="checkbox"
            />
            <span className="toggleIndicator" />
            Automatically create detailed GitHub issues in impacted repositories
          </label>
          <p>
            Sprocky will generate an issue with changelog context, detected usage
            evidence, and migration steps in any monitored repository with confirmed usage.
          </p>
        </section>

        <button className="button saveButton" type="submit">
          Save Preferences
        </button>
      </form>
    </DashboardShell>
  );
}
