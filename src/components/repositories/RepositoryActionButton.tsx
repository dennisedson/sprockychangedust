"use client";

import { useFormStatus } from "react-dom";
import { CheckCircle2, EyeOff, Link2, RotateCcw, Unlink2 } from "lucide-react";

type RepositoryActionButtonProps = {
  icon: "disconnect" | "ignore" | "reconnect" | "scan" | "watch";
  label: string;
  pendingLabel: string;
  size?: "default" | "small";
  tone?: "danger" | "default";
  disabled?: boolean;
  iconOnly?: boolean;
};

const icons = {
  disconnect: Unlink2,
  ignore: EyeOff,
  reconnect: Link2,
  scan: RotateCcw,
  watch: CheckCircle2,
};

export function RepositoryActionButton({
  icon,
  label,
  pendingLabel,
  size = "default",
  tone = "default",
  disabled = false,
  iconOnly = false,
}: RepositoryActionButtonProps) {
  const { pending } = useFormStatus();
  const Icon = icons[icon];
  const className = `button secondary${tone === "danger" ? " danger" : ""}${
    size === "small" ? " smallButton" : ""
  }${iconOnly ? " iconOnlyButton" : ""}`;
  const buttonLabel = pending ? pendingLabel : label;

  return (
    <button
      aria-label={iconOnly ? buttonLabel : undefined}
      aria-live="polite"
      className={className}
      disabled={pending || disabled}
      title={iconOnly ? buttonLabel : undefined}
      type="submit"
    >
      {pending ? <span aria-hidden="true" className="spinner" /> : <Icon size={17} />}
      {iconOnly ? <span className="sr-only">{buttonLabel}</span> : buttonLabel}
    </button>
  );
}
