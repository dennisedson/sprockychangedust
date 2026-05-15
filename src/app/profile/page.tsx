// @workflow_state: REVIEW
import { Building2, LinkIcon, Mail, MapPin, Pencil, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProfileSaveButton } from "@/components/profile/ProfileSaveButton";
import { saveProfileAction, signOutAllSessionsAction } from "@/app/profile/actions";
import { getCurrentNotificationSettings } from "@/lib/notifications/settings";
import { getCurrentUserProfile } from "@/lib/profile/userProfile";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const [profile, notificationSettings] = await Promise.all([
    getCurrentUserProfile(),
    getCurrentNotificationSettings(),
  ]);
  const emailAddress = notificationSettings.emailAddress || profile.email || "";
  const wasSaved = params.saved === "1";

  return (
    <DashboardShell active="Profile">
      <div className="profileGrid">
        <aside className="card profileSummary">
          <div className="largeAvatar">{profile.initials}</div>
          <h1>{profile.displayName}</h1>
          <p>{profile.title || profile.company || "Sprocky profile"}</p>
          <a className="button secondary" href="#profile-form">
            <Pencil size={16} />
            Edit Profile
          </a>
          <dl>
            <ProfileFact icon={Mail} value={emailAddress || "Email not set"} />
            <ProfileFact icon={Building2} value={profile.company || "Company not set"} />
            <ProfileFact icon={MapPin} value={profile.location || "Location not set"} />
            <ProfileFact
              href={profile.githubUrl || undefined}
              icon={LinkIcon}
              value={formatGitHubUrl(profile.githubUrl)}
            />
          </dl>
        </aside>

        <div className="profileMain">
          <form action={saveProfileAction} className="card profileForm" id="profile-form">
            {wasSaved ? (
              <div className="saveStatus" role="status">
                Profile saved.
              </div>
            ) : null}
            <h2>Account Settings</h2>
            <div className="formGrid">
              <label className="field">
                First Name
                <input
                  className="input"
                  defaultValue={profile.firstName || ""}
                  name="firstName"
                />
              </label>
              <label className="field">
                Last Name
                <input
                  className="input"
                  defaultValue={profile.lastName || ""}
                  name="lastName"
                />
              </label>
            </div>
            <label className="field">
              Email Address
              <input
                className="input"
                defaultValue={emailAddress}
                name="emailAddress"
                placeholder="you@example.com"
                type="email"
              />
            </label>
            <div className="formGrid">
              <label className="field">
                Title
                <input className="input" defaultValue={profile.title || ""} name="title" />
              </label>
              <label className="field">
                Company
                <input className="input" defaultValue={profile.company || ""} name="company" />
              </label>
            </div>
            <div className="formGrid">
              <label className="field">
                Location
                <input className="input" defaultValue={profile.location || ""} name="location" />
              </label>
              <label className="field">
                GitHub URL
                <input
                  className="input"
                  defaultValue={profile.githubUrl || ""}
                  inputMode="url"
                  name="githubUrl"
                  placeholder="https://github.com/username"
                />
              </label>
            </div>
            <label className="field">
              Bio
              <textarea
                className="textarea"
                defaultValue={profile.bio || ""}
                name="bio"
                rows={4}
              />
            </label>
            <ProfileSaveButton />
          </form>

          <section className="card sessionsCard">
            <div>
              <h2>Sessions</h2>
              <p>Manage your active sessions across devices.</p>
            </div>
            <form action={signOutAllSessionsAction}>
              <button className="button ghost" disabled={!profile.isAuthenticated} type="submit">
                <ShieldCheck size={16} />
                Sign out all
              </button>
            </form>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}

function ProfileFact({
  href,
  icon: Icon,
  value,
}: {
  href?: string;
  icon: typeof Mail;
  value: string;
}) {
  return (
    <div>
      <Icon size={17} />
      <dd>
        {href ? (
          <a href={href} rel="noreferrer" target="_blank">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function formatGitHubUrl(githubUrl: string | null) {
  if (!githubUrl) {
    return "GitHub not set";
  }

  return githubUrl.replace(/^https?:\/\//i, "");
}
