import {
  Activity,
  AlertTriangle,
  BellRing,
  Box,
  Clock3,
  Github,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SeverityBadge } from "@/components/dashboard/SeverityBadge";
import { StatCard } from "@/components/dashboard/StatCard";

const recentAlerts = [
  {
    title: "Contacts API v1 sunset reminder",
    repo: "acme-corp/crm-sync-worker",
    time: "2 hours ago",
    severity: "red" as const,
  },
  {
    title: "New CMS source-code API guidance",
    repo: "hubspot/hubspot-cms-react",
    time: "4 hours ago",
    severity: "amber" as const,
  },
  {
    title: "OAuth token metadata update",
    repo: "sprocky-inc/changedust-core",
    time: "1 day ago",
    severity: "green" as const,
  },
];

export default function DashboardPage() {
  return (
    <DashboardShell active="Dashboard">
      <div className="pageHeader">
        <div>
          <h1>Overview</h1>
          <p>Monitor changelog impact across connected GitHub repositories.</p>
        </div>
        <select className="select compact" defaultValue="7">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      <div className="statsGrid">
        <StatCard icon={Github} title="Connected Repositories" value="24" helper="+2 this month" />
        <StatCard icon={AlertTriangle} title="Critical Alerts" value="8" helper="+3 this week" />
        <StatCard icon={BellRing} title="Notifications Sent" value="142" helper="Stable" />
        <StatCard icon={Clock3} title="Avg Scan Time" value="1.2m" helper="-12s improvement" />
      </div>

      <div className="dashboardGrid">
        <section className="card chartCard">
          <h2>Detection Activity</h2>
          <div className="barChart" aria-label="Detection activity by weekday">
            {[12, 19, 15, 25, 33, 10, 8].map((height, index) => (
              <span
                aria-label={`${height} detections`}
                key={height + index}
                style={{ height: `${height * 6}px` }}
              />
            ))}
          </div>
          <div className="chartLabels">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </section>

        <section className="card activityCard">
          <div className="sectionTitle">
            <h2>Recent Alerts</h2>
            <a href="/repositories">View all</a>
          </div>
          <div className="activityList">
            {recentAlerts.map((alert) => (
              <article className="activityItem" key={alert.title}>
                <span className="activityIcon">
                  <Activity size={18} />
                </span>
                <div>
                  <strong>{alert.title}</strong>
                  <span>{alert.repo}</span>
                  <small>{alert.time}</small>
                </div>
                <SeverityBadge severity={alert.severity} />
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="card issuePreview">
        <Box size={22} />
        <div>
          <h2>Issue creation is enabled for critical confirmed impacts.</h2>
          <p>
            Sprocky will include the changelog source, scan evidence, and migration
            steps in each generated GitHub issue.
          </p>
        </div>
      </section>
    </DashboardShell>
  );
}
