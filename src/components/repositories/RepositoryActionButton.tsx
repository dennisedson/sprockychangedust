"use client";

import { useFormStatus } from "react-dom";
import { Link2, RotateCcw, Unlink2 } from "lucide-react";

type RepositoryActionButtonProps = {
  icon: "disconnect" | "reconnect" | "scan";
  label: string;
  pendingLabel: string;
  size?: "default" | "small";
  tone?: "danger" | "default";
  disabled?: boolean;
};

const icons = {
  disconnect: Unlink2,
  reconnect: Link2,
  scan: RotateCcw,
};

export function RepositoryActionButton({
  icon,
  label,
  pendingLabel,
  size = "default",
  tone = "default",
  disabled = false,
}: RepositoryActionButtonProps) {
  const { pending } = useFormStatus();
  const Icon = icons[icon];
  const className = `button secondary${tone === "danger" ? " danger" : ""}${
    size === "small" ? " smallButton" : ""
  }`;

  return (
    <button
      aria-live="polite"
      className={className}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? <span aria-hidden="true" className="spinner" /> : <Icon size={17} />}
      {pending ? pendingLabel : label}
    </button>
  );
}
