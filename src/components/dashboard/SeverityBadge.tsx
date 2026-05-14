export function SeverityBadge({ severity }: { severity: "red" | "amber" | "green" }) {
  const label = {
    red: "Critical",
    amber: "Warning",
    green: "Info",
  }[severity];

  return <span className={`badge ${severity}`}>{label}</span>;
}
