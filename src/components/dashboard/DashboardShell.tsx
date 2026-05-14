import Link from "next/link";
import type { Route } from "next";
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

const navItems: { href: Route; label: string; icon: typeof Grid2X2 }[] = [
  { href: "/dashboard", label: "Dashboard", icon: Grid2X2 },
  { href: "/repositories", label: "Repositories", icon: FolderGit2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function DashboardShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
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
            AD
          </div>
          <div>
            <strong>Alex Developer</strong>
            <span>alex@hubspot.com</span>
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
