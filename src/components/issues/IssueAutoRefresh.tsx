// @workflow_state: REVIEW
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const refreshIntervalMs = 15000;

export function IssueAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, refreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [router]);

  return null;
}
