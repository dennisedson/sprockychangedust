// @workflow_state: REVIEW
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type RepositorySetupScanStarterProps = {
  installationId: number | null;
  pendingScanCount: number;
  syncId: string | null;
};

export function RepositorySetupScanStarter({
  installationId,
  pendingScanCount,
  syncId,
}: RepositorySetupScanStarterProps) {
  const router = useRouter();

  useEffect(() => {
    if (!installationId && pendingScanCount === 0) {
      return;
    }

    let isCancelled = false;
    const sessionKey = installationId
      ? `sprocky-installation-scan-${installationId}-${syncId || "current"}`
      : "sprocky-repository-scan-queue";
    const storedState = window.sessionStorage.getItem(sessionKey);

    if (installationId && storedState === "complete") {
      return;
    }

    if (storedState?.startsWith("running:")) {
      const [, startedAt] = storedState.split(":");
      const startedAtTimestamp = Number(startedAt);

      if (Number.isFinite(startedAtTimestamp) && Date.now() - startedAtTimestamp < 60_000) {
        return;
      }
    }

    window.sessionStorage.setItem(sessionKey, `running:${Date.now()}`);

    async function drainScanQueue() {
      let isComplete = false;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (isCancelled) {
          return;
        }

        const response = await fetch("/api/repositories/scan-installation", {
          body: JSON.stringify({ installationId, limit: 5 }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        if (!response.ok) {
          break;
        }

        const result = await response.json() as {
          failed: number;
          remaining: number;
          scanned: number;
        };

        router.refresh();

        if (result.remaining <= 0) {
          isComplete = true;
          break;
        }

        if (result.scanned + result.failed === 0) {
          break;
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 750);
        });
      }

      if (isCancelled) {
        return;
      }

      if (isComplete && installationId) {
        window.sessionStorage.setItem(sessionKey, "complete");
      } else {
        window.sessionStorage.removeItem(sessionKey);
      }

      router.refresh();
    }

    void drainScanQueue();

    return () => {
      isCancelled = true;
    };
  }, [installationId, pendingScanCount, router, syncId]);

  return null;
}
