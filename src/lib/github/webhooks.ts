// @workflow_state: REVIEW
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

type InstallationOwnerContext = {
  userId: string;
  workspaceId: string | null;
};

export async function handleGitHubInstallationWebhook(payload: InstallationPayload) {
  const repositories =
    payload.repositories || payload.repositories_added || [];
  const removedRepositories = payload.repositories_removed || [];
  const accountLogin = payload.installation.account?.login || "unknown";

  const previousStatus = await upsertInstallation({
    installationId: payload.installation.id,
    accountLogin,
    isDeleted: payload.action === "deleted",
  });

  if (payload.action === "deleted") {
    await deleteRepositoriesForInstallation(payload.installation.id);
    return;
  }

  if (repositories.length > 0) {
    if (previousStatus === "deleted") {
      await deleteRepositoriesByGithubRepoIds(repositories.map((repository) => repository.id));
    }

    await upsertRepositories({
      installationId: payload.installation.id,
      repositories,
      isActiveForScanning: true,
    });

    await scanInstalledRepositoriesByGithubRepoIds(
      repositories.map((repository) => repository.id),
      { limit: initialScanLimit },
    );
  }

  if (removedRepositories.length > 0) {
    await deleteRepositoriesByGithubRepoIds(
      removedRepositories.map((repository) => repository.id),
    );
  }
}

export async function handleGitHubRepositoryWebhook(payload: RepositoryWebhookPayload) {
  const accountLogin =
    payload.installation.account?.login || payload.repository.owner?.login || "unknown";

  await upsertInstallation({
    installationId: payload.installation.id,
    accountLogin,
    isDeleted: false,
  });

  if (["deleted", "transferred"].includes(payload.action)) {
    await deleteRepositoriesByGithubRepoIds([payload.repository.id]);
    return;
  }

  const isInactive = payload.action === "archived";

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

export async function syncInstallationRepositories(
  installationId: number,
  options: {
    ownerContext?: InstallationOwnerContext;
    runInitialScan?: boolean;
  } = {},
) {
  const repositories = await listInstallationRepositories(installationId);
  const runInitialScan = options.runInitialScan ?? true;

  const previousStatus = await upsertInstallation({
    installationId,
    accountLogin: "unknown",
    isDeleted: false,
    ownerContext: options.ownerContext,
  });

  if (previousStatus === "deleted") {
    await deleteRepositoriesByGithubRepoIds(repositories.map((repository) => repository.id));
  }

  await upsertRepositories({
    installationId,
    repositories,
    isActiveForScanning: true,
  });

  if (runInitialScan) {
    await scanInstalledRepositoriesByGithubRepoIds(
      repositories.map((repository) => repository.id),
      { limit: initialScanLimit },
    );
  }

  return repositories;
}

async function upsertInstallation(input: {
  installationId: number;
  accountLogin: string;
  isDeleted: boolean;
  ownerContext?: InstallationOwnerContext;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: existingInstallation, error: lookupError } = await supabase
    .from("github_app_installations")
    .select("status,github_account_login")
    .eq("installation_id", input.installationId)
    .maybeSingle<{ github_account_login: string; status: "active" | "deleted" }>();

  if (lookupError) {
    throw lookupError;
  }

  const installation = {
    installation_id: input.installationId,
    github_account_login:
      input.accountLogin === "unknown"
        ? existingInstallation?.github_account_login || input.accountLogin
        : input.accountLogin,
    status: input.isDeleted ? "deleted" : "active",
    ...(input.ownerContext
      ? {
          user_id: input.ownerContext.userId,
          workspace_id: input.ownerContext.workspaceId,
        }
      : {}),
  };

  const { error } = await supabase
    .from("github_app_installations")
    .upsert(installation, { onConflict: "installation_id" });

  if (error && input.ownerContext && isMissingWorkspaceColumnError(error)) {
    const fallbackInstallation = { ...installation };
    delete fallbackInstallation.workspace_id;
    const { error: fallbackError } = await supabase
      .from("github_app_installations")
      .upsert(fallbackInstallation, { onConflict: "installation_id" });

    if (fallbackError) {
      throw fallbackError;
    }

    return existingInstallation?.status || null;
  }

  if (error) {
    throw error;
  }

  return existingInstallation?.status || null;
}

function isMissingWorkspaceColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.message?.includes("workspace_id") ||
    false
  );
}

async function upsertRepositories(input: {
  installationId: number;
  repositories: GitHubInstallationRepository[];
  isActiveForScanning: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  await deleteRepositoriesForOtherInstallations({
    installationId: input.installationId,
    githubRepoIds: input.repositories.map((repository) => repository.id),
  });

  const { error } = await supabase.from("installed_repositories").upsert(
    input.repositories.map((repository) => ({
      installation_id: input.installationId,
      github_repo_id: repository.id,
      repo_name: repository.full_name,
      repo_private: repository.private,
      is_active_for_scanning: input.isActiveForScanning,
    })),
    { onConflict: "github_repo_id" },
  );

  if (error) {
    throw error;
  }
}

async function deleteRepositoriesForOtherInstallations(input: {
  installationId: number;
  githubRepoIds: number[];
}) {
  if (input.githubRepoIds.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: existingRepositories, error: lookupError } = await supabase
    .from("installed_repositories")
    .select("id, installation_id")
    .in("github_repo_id", input.githubRepoIds);

  if (lookupError) {
    throw lookupError;
  }

  const staleRepositoryIds = (existingRepositories || [])
    .filter((repository) => repository.installation_id !== input.installationId)
    .map((repository) => repository.id);

  if (staleRepositoryIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("installed_repositories")
    .delete()
    .in("id", staleRepositoryIds);

  if (error) {
    throw error;
  }
}

async function deleteRepositoriesForInstallation(installationId: number) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .delete()
    .eq("installation_id", installationId);

  if (error) {
    throw error;
  }
}

async function deleteRepositoriesByGithubRepoIds(githubRepoIds: number[]) {
  if (githubRepoIds.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .delete()
    .in("github_repo_id", githubRepoIds);

  if (error) {
    throw error;
  }
}
