// @workflow_state: REVIEW
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Unplug } from "lucide-react";

type GitHubDisconnectButtonProps = {
  disabled: boolean;
};

export function GitHubDisconnectButton({ disabled }: GitHubDisconnectButtonProps) {
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function disconnectGitHub() {
    const shouldDisconnect = window.confirm(
      "Disconnect GitHub from Sprocky? This uninstalls the GitHub App and removes connected repository records from Sprocky.",
    );

    if (!shouldDisconnect) {
      return;
    }

    setIsDisconnecting(true);
    setStatus(null);

    const response = await fetch("/api/github/disconnect", {
      method: "POST",
    });
    const payload = (await response.json()) as {
      disconnectedInstallationCount?: number;
      error?: string;
    };

    if (!response.ok) {
      setStatus(payload.error || "GitHub disconnect failed.");
      setIsDisconnecting(false);
      return;
    }

    setStatus(
      payload.disconnectedInstallationCount && payload.disconnectedInstallationCount > 0
        ? "GitHub disconnected."
        : "No active GitHub connection found.",
    );
    setIsDisconnecting(false);
    router.refresh();
  }

  return (
    <span className="settingsActionControl">
      <button
        className="button secondary danger"
        disabled={disabled || isDisconnecting}
        onClick={disconnectGitHub}
        type="button"
      >
        {isDisconnecting ? <span aria-hidden="true" className="spinner" /> : <Unplug size={17} />}
        {isDisconnecting ? "Disconnecting..." : "Disconnect GitHub"}
      </button>
      {status ? <span>{status}</span> : null}
    </span>
  );
}
