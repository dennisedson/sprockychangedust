import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

export function StatCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <article className="card statCard">
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <span>
          <ArrowUpRight size={14} />
          {helper}
        </span>
      </div>
      <Icon size={23} />
    </article>
  );
}
