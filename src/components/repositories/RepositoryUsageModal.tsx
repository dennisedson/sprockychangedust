// @workflow_state: REVIEW
"use client";

import { useEffect, useId, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { ScanSignal } from "@/lib/scanner/types";

type RepositoryUsageModalProps = {
  repositoryName: string;
  signals: ScanSignal[];
};

export function RepositoryUsageModal({
  repositoryName,
  signals,
}: RepositoryUsageModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <button className="scanSummaryButton" type="button" onClick={() => setIsOpen(true)}>
        <span className="badge orange">Detected</span>
        <span>{signals.length} signals</span>
      </button>

      {isOpen ? (
        <div className="modalOverlay" role="presentation" onMouseDown={() => setIsOpen(false)}>
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="usageModal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="usageModalHeader">
              <div>
                <p>HubSpot usage signals</p>
                <h2 id={titleId}>{repositoryName}</h2>
              </div>
              <button
                aria-label="Close usage signals"
                className="iconButton"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="usageSignalList">
              {signals.map((signal, index) => (
                <article className="usageSignal" key={`${signal.filePath}-${signal.label}-${index}`}>
                  <div className="usageSignalTopline">
                    <span className={`badge ${signal.severity}`}>{signal.severity}</span>
                    <strong>{signal.label}</strong>
                  </div>
                  <a
                    className="signalFileLink"
                    href={getGitHubFileUrl(repositoryName, signal)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>{formatSignalLocation(signal)}</span>
                    <ExternalLink size={14} />
                  </a>
                  {signal.excerpt ? <pre>{signal.excerpt}</pre> : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatSignalLocation(signal: ScanSignal) {
  return signal.line ? `${signal.filePath}:L${signal.line}` : signal.filePath;
}

function getGitHubFileUrl(repositoryName: string, signal: ScanSignal) {
  const encodedPath = signal.filePath.split("/").map(encodeURIComponent).join("/");
  const lineHash = signal.line ? `#L${signal.line}` : "";

  return `https://github.com/${repositoryName}/blob/HEAD/${encodedPath}${lineHash}`;
}
