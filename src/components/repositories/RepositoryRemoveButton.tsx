// @workflow_state: REVIEW
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type RepositoryRemoveButtonProps = {
  repositoryId: string;
  repositoryName: string;
};

export function RepositoryRemoveButton({
  repositoryId,
  repositoryName,
}: RepositoryRemoveButtonProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeRepository() {
    const shouldRemove = window.confirm(
      `Remove ${repositoryName} from the GitHub App installation and Sprocky? This deletes its scan results and tracked issue records from this app.`,
    );

    if (!shouldRemove) {
      return;
    }

    setIsRemoving(true);
    setError(null);

    const response = await fetch("/api/repositories/remove", {
      body: JSON.stringify({ repositoryId }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error || "Repository removal failed.");
      setIsRemoving(false);
      return;
    }

    setIsRemoving(false);
    router.refresh();
  }

  return (
    <span className="repositoryRemoveAction">
      <button
        aria-label={isRemoving ? "Removing..." : "Remove from GitHub App"}
        aria-live="polite"
        className="button secondary danger smallButton iconOnlyButton"
        disabled={isRemoving}
        onClick={removeRepository}
        title={isRemoving ? "Removing..." : "Remove from GitHub App"}
        type="button"
      >
        {isRemoving ? <span aria-hidden="true" className="spinner" /> : <Trash2 size={17} />}
        <span className="sr-only">{isRemoving ? "Removing..." : "Remove from GitHub App"}</span>
      </button>
      {error ? <span>{error}</span> : null}
    </span>
  );
}
