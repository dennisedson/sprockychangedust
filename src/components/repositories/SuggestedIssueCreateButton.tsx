// @workflow_state: REVIEW
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type SuggestedIssueCreateButtonProps = {
  changelogEntryId: string;
  repositoryId: string;
};

export function SuggestedIssueCreateButton({
  changelogEntryId,
  repositoryId,
}: SuggestedIssueCreateButtonProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createIssue() {
    setIsCreating(true);
    setError(null);

    const response = await fetch("/api/issues", {
      body: JSON.stringify({
        changelogEntryId,
        repositoryIds: [repositoryId],
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error || "Issue creation failed.");
      setIsCreating(false);
      return;
    }

    setIsCreating(false);
    router.refresh();
  }

  return (
    <span className="suggestedIssueAction">
      <button
        className="button secondary smallButton"
        disabled={isCreating}
        onClick={createIssue}
        type="button"
      >
        {isCreating ? <span aria-hidden="true" className="spinner" /> : <Plus size={14} />}
        {isCreating ? "Creating..." : "Create issue"}
      </button>
      {error ? <span>{error}</span> : null}
    </span>
  );
}
