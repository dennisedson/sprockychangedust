import { Github, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function SettingsPage() {
  return (
    <DashboardShell active="Settings">
      <div className="pageHeader">
        <div>
          <h1>Settings</h1>
          <p>Control where Sprocky sends confirmed changelog impact alerts.</p>
        </div>
      </div>

      <form className="settingsStack">
        <section className="card settingsCard">
          <div className="settingsTitle">
            <span className="featureIcon">
              <Mail size={21} />
            </span>
            <h2>Email Notifications</h2>
          </div>
          <label className="settingToggle">
            <button className="toggle" data-active="true" type="button" />
            Enable email notifications for critical and warning HubSpot changelog alerts
          </label>
          <label className="field">
            Primary Notification Email Address
            <input className="input" defaultValue="alex@hubspot.com" type="email" />
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
            <button className="toggle" data-active="true" type="button" />
            Automatically create detailed GitHub issues in impacted repositories
          </label>
          <p>
            Sprocky will generate an issue with changelog context, detected usage
            evidence, and migration steps in any monitored repository with confirmed usage.
          </p>
        </section>

        <button className="button saveButton" type="button">
          Save Preferences
        </button>
      </form>
    </DashboardShell>
  );
}
