// @workflow_state: REVIEW
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type RepositorySetupScanStarterProps = {
  installationId: number | null;
  syncId: string | null;
};

export function RepositorySetupScanStarter({
  installationId,
  syncId,
}: RepositorySetupScanStarterProps) {
  const router = useRouter();

  useEffect(() => {
    if (!installationId) {
      return;
    }

    const sessionKey = `sprocky-installation-scan-${installationId}-${syncId || "current"}`;

    if (window.sessionStorage.getItem(sessionKey) === "started") {
      return;
    }

    window.sessionStorage.setItem(sessionKey, "started");

    void fetch("/api/repositories/scan-installation", {
      body: JSON.stringify({ installationId }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }).finally(() => {
      router.refresh();
    });
  }, [installationId, router, syncId]);

  return null;
}
