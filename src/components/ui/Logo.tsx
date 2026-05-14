import { Atom } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <span className="logoMark" aria-hidden="true">
        <Atom size={compact ? 17 : 20} />
      </span>
      <span>{compact ? "Changedust" : "Sprocky Changedust"}</span>
    </div>
  );
}
