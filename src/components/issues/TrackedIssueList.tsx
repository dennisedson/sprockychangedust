// @workflow_state: REVIEW
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, X } from "lucide-react";
import type { TrackedIssueDisplay } from "@/lib/issues/trackedIssues";
import styles from "./TrackedIssueList.module.css";

export function TrackedIssueList({
  emptyLabel,
  issues,
  variant,
}: {
  emptyLabel?: string;
  issues: TrackedIssueDisplay[];
  variant: "changelog" | "repository";
}) {
  const router = useRouter();
  const [visibleIssues, setVisibleIssues] = useState(issues);

  useEffect(() => {
    setVisibleIssues(issues);
  }, [issues]);

  async function dismissIssue(issueId: string) {
    const previousIssues = visibleIssues;
    setVisibleIssues((currentIssues) => currentIssues.filter((issue) => issue.id !== issueId));

    const response = await fetch("/api/issues", {
      body: JSON.stringify({ trackedIssueId: issueId }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    if (!response.ok) {
      setVisibleIssues(previousIssues);
      return;
    }

    router.refresh();
  }

  if (visibleIssues.length === 0) {
    return emptyLabel ? <span className={styles.empty}>{emptyLabel}</span> : null;
  }

  return (
    <div className={styles.issueList}>
      {visibleIssues.map((issue) => (
        <article className={styles.issueItem} key={issue.id}>
          <a href={issue.issueUrl} rel="noreferrer" target="_blank">
            <span>
              {variant === "changelog" ? issue.repositoryName : issue.changelogTitle}
            </span>
            <strong>#{issue.issueNumber}</strong>
            <ExternalLink size={12} />
          </a>
          <button
            aria-label={`Dismiss issue ${issue.issueNumber}`}
            onClick={() => dismissIssue(issue.id)}
            type="button"
          >
            <X size={12} />
          </button>
        </article>
      ))}
    </div>
  );
}
