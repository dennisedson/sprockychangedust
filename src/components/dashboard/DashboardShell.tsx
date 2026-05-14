import Link from "next/link";
import type { Route } from "next";
import { unstable_noStore as noStore } from "next/cache";
import {
  Bell,
  FolderGit2,
  Grid2X2,
  Plus,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { getNotificationSettings } from "@/lib/notifications/settings";

const navItems: { href: Route; label: string; icon: typeof Grid2X2 }[] = [
  { href: "/dashboard", label: "Dashboard", icon: Grid2X2 },
  { href: "/repositories", label: "Repositories", icon: FolderGit2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export async function DashboardShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  noStore();

  const settings = await getNotificationSettings();
  const emailAddress = settings.emailAddress || "No alert email set";
  const initials = getInitials(emailAddress);

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <Logo compact />
        </div>
        <nav className="sidebarNav" aria-label="Main">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.label;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "navItem active" : "navItem"}
                href={item.href}
                key={item.href}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebarUser">
          <div className="avatar" aria-hidden="true">
            {initials}
          </div>
          <div>
            <strong>Alert Recipient</strong>
            <span>{emailAddress}</span>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <label className="globalSearch">
            <Search size={18} />
            <span className="sr-only">Search</span>
            <input placeholder="Search resources, repos, or settings..." />
          </label>
          <div className="topbarActions">
            <button className="iconButton" type="button" aria-label="Notifications">
              <Bell size={18} />
              <span className="dot" />
            </button>
            <button className="button" type="button">
              <Plus size={17} />
              New Project
            </button>
          </div>
        </header>
        <section className="pageContent">{children}</section>
      </main>
    </div>
  );
}

function getInitials(emailAddress: string) {
  if (!emailAddress.includes("@")) {
    return "SC";
  }

  const [name] = emailAddress.split("@");
  const parts = name.split(/[._-]/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "SC";
}
