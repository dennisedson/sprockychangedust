import { Building2, LinkIcon, Mail, MapPin, Pencil, Save, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function ProfilePage() {
  return (
    <DashboardShell active="Profile">
      <div className="profileGrid">
        <aside className="card profileSummary">
          <div className="largeAvatar">AD</div>
          <h1>Alex Developer</h1>
          <p>Senior HubSpot CMS Developer</p>
          <button className="button secondary" type="button">
            <Pencil size={16} />
            Edit Profile
          </button>
          <dl>
            <div>
              <Mail size={17} />
              <dd>alex@hubspot.com</dd>
            </div>
            <div>
              <Building2 size={17} />
              <dd>Acme Agency</dd>
            </div>
            <div>
              <MapPin size={17} />
              <dd>San Francisco, CA</dd>
            </div>
            <div>
              <LinkIcon size={17} />
              <dd>github.com/alexdev</dd>
            </div>
          </dl>
        </aside>

        <div className="profileMain">
          <section className="card profileForm">
            <h2>Account Settings</h2>
            <div className="formGrid">
              <label className="field">
                First Name
                <input className="input" defaultValue="Alex" />
              </label>
              <label className="field">
                Last Name
                <input className="input" defaultValue="Developer" />
              </label>
            </div>
            <label className="field">
              Email Address
              <input className="input" defaultValue="alex@hubspot.com" type="email" />
            </label>
            <label className="field">
              Bio
              <textarea
                className="textarea"
                defaultValue="HubSpot developer focused on resilient integrations, CMS architecture, and fewer surprise migrations."
                rows={4}
              />
            </label>
            <button className="button alignRight" type="button">
              <Save size={16} />
              Save Changes
            </button>
          </section>

          <section className="card sessionsCard">
            <div>
              <h2>Sessions</h2>
              <p>Manage your active sessions across devices.</p>
            </div>
            <button className="button ghost" type="button">
              <ShieldCheck size={16} />
              Sign out all
            </button>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
