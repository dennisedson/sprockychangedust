import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";
import {
  type GitHubInstallationRepository,
  listInstallationRepositories,
} from "@/lib/github/repositories";
import { updateTrackedIssueStateFromGitHub } from "@/lib/issues/trackedIssues";
import { scanInstalledRepositoriesByGithubRepoIds } from "@/lib/scanner/scanInstalledRepository";

const initialScanLimit = 25;

export function verifyGitHubWebhookSignature(payload: string, signatureHeader: string | null) {
  if (!signatureHeader) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", requireEnv("GITHUB_WEBHOOK_SECRET"))
    .update(payload)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

type GitHubRepositoryPayload = {
  id: number;
  full_name: string;
  private: boolean;
};

type InstallationPayload = {
  action: string;
  installation: {
    id: number;
    account?: {
      login?: string;
    };
  };
  repositories?: GitHubRepositoryPayload[];
  repositories_added?: GitHubRepositoryPayload[];
  repositories_removed?: GitHubRepositoryPayload[];
};

type RepositoryWebhookPayload = {
  action: string;
  installation: {
    id: number;
    account?: {
      login?: string;
    };
  };
  repository: GitHubRepositoryPayload & {
    owner?: {
      login?: string;
    };
  };
};

type IssueWebhookPayload = {
  action: string;
  issue: {
    id: number;
    number: number;
    html_url: string;
    state: "open" | "closed";
    assignees?: Array<{
      login?: string | null;
    }> | null;
    labels?: Array<
      | string
      | {
          name?: string | null;
        }
    > | null;
    closed_at: string | null;
  };
};

export async function handleGitHubInstallationWebhook(payload: InstallationPayload) {
  const repositories =
    payload.repositories || payload.repositories_added || [];
  const removedRepositories = payload.repositories_removed || [];
  const accountLogin = payload.installation.account?.login || "unknown";

  await upsertInstallation({
    installationId: payload.installation.id,
    accountLogin,
    isDeleted: payload.action === "deleted",
  });

  if (repositories.length > 0) {
    await upsertRepositories({
      installationId: payload.installation.id,
      repositories,
      isActiveForScanning: payload.action !== "deleted",
    });

    if (payload.action !== "deleted") {
      await scanInstalledRepositoriesByGithubRepoIds(
        repositories.map((repository) => repository.id),
        { limit: initialScanLimit },
      );
    }
  }

  if (removedRepositories.length > 0) {
    await upsertRepositories({
      installationId: payload.installation.id,
      repositories: removedRepositories,
      isActiveForScanning: false,
    });
  }
}

export async function handleGitHubRepositoryWebhook(payload: RepositoryWebhookPayload) {
  const accountLogin =
    payload.installation.account?.login || payload.repository.owner?.login || "unknown";
  const isInactive = ["deleted", "archived", "transferred"].includes(payload.action);

  await upsertInstallation({
    installationId: payload.installation.id,
    accountLogin,
    isDeleted: false,
  });
  await upsertRepositories({
    installationId: payload.installation.id,
    repositories: [payload.repository],
    isActiveForScanning: !isInactive,
  });

  if (!isInactive) {
    await scanInstalledRepositoriesByGithubRepoIds([payload.repository.id], {
      limit: initialScanLimit,
    });
  }
}

export async function handleGitHubIssueWebhook(payload: IssueWebhookPayload) {
  if (!["closed", "reopened", "edited"].includes(payload.action)) {
    return;
  }

  await updateTrackedIssueStateFromGitHub({
    githubIssueId: payload.issue.id,
    issueNumber: payload.issue.number,
    issueUrl: payload.issue.html_url,
    issueState: payload.issue.state,
    assignees: mapIssueAssignees(payload.issue.assignees),
    labels: mapIssueLabels(payload.issue.labels),
    closedAt: payload.issue.closed_at,
  });
}

function mapIssueAssignees(assignees?: Array<{ login?: string | null }> | null) {
  return (assignees || [])
    .map((assignee) => assignee.login)
    .filter((login): login is string => Boolean(login));
}

function mapIssueLabels(
  labels?: Array<
    | string
    | {
        name?: string | null;
      }
  > | null,
) {
  return (labels || [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((label): label is string => Boolean(label));
}

export async function syncInstallationRepositories(installationId: number) {
  const repositories = await listInstallationRepositories(installationId);

  await upsertInstallation({
    installationId,
    accountLogin: "unknown",
    isDeleted: false,
  });
  await upsertRepositories({
    installationId,
    repositories,
    isActiveForScanning: true,
  });

  await scanInstalledRepositoriesByGithubRepoIds(
    repositories.map((repository) => repository.id),
    { limit: initialScanLimit },
  );

  return repositories;
}

async function upsertInstallation(input: {
  installationId: number;
  accountLogin: string;
  isDeleted: boolean;
}) {
  const supabase = createSupabaseAdminClient();

  await supabase.from("github_app_installations").upsert(
    {
      installation_id: input.installationId,
      github_account_login: input.accountLogin,
      status: input.isDeleted ? "deleted" : "active",
    },
    { onConflict: "installation_id" },
  );
}

async function upsertRepositories(input: {
  installationId: number;
  repositories: GitHubInstallationRepository[];
  isActiveForScanning: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("installed_repositories").upsert(
    input.repositories.map((repository) => ({
      installation_id: input.installationId,
      github_repo_id: repository.id,
      repo_name: repository.full_name,
      repo_private: repository.private,
      is_active_for_scanning: input.isActiveForScanning,
    })),
    { onConflict: "github_repo_id" },
  );
}
