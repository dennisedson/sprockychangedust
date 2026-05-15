// @workflow_state: REVIEW
import { deleteGitHubAppInstallation } from "@/lib/github/app";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type GitHubInstallationRow = {
  installation_id: number;
  github_account_login: string;
};

type InstalledRepositoryRow = {
  id: string;
  installation_id: number;
};

export type GitHubInstallationSummary = {
  accountLogins: string[];
  connectedRepositoryCount: number;
  activeInstallationCount: number;
};

export async function getGitHubInstallationSummary(): Promise<GitHubInstallationSummary> {
  const supabase = createSupabaseAdminClient();
  const [{ data: installations, error: installationsError }, { data: repositories, error: repositoriesError }] =
    await Promise.all([
      supabase
        .from("github_app_installations")
        .select("installation_id,github_account_login")
        .eq("status", "active")
        .returns<GitHubInstallationRow[]>(),
      supabase
        .from("installed_repositories")
        .select("id,installation_id")
        .eq("is_active_for_scanning", true)
        .returns<InstalledRepositoryRow[]>(),
    ]);

  if (installationsError) {
    throw installationsError;
  }

  if (repositoriesError) {
    throw repositoriesError;
  }

  const activeInstallationIds = new Set(
    installations.map((installation) => installation.installation_id),
  );

  return {
    accountLogins: Array.from(
      new Set(installations.map((installation) => installation.github_account_login)),
    ),
    activeInstallationCount: installations.length,
    connectedRepositoryCount: repositories.filter((repository) =>
      activeInstallationIds.has(repository.installation_id),
    ).length,
  };
}

export async function disconnectGitHubInstallations() {
  const supabase = createSupabaseAdminClient();
  const { data: installations, error } = await supabase
    .from("github_app_installations")
    .select("installation_id,github_account_login")
    .eq("status", "active")
    .returns<GitHubInstallationRow[]>();

  if (error) {
    throw error;
  }

  if (installations.length === 0) {
    return {
      disconnectedInstallationCount: 0,
    };
  }

  const installationIds = installations.map((installation) => installation.installation_id);

  for (const installationId of installationIds) {
    await deleteGitHubAppInstallation(installationId);
  }

  const { error: repositoryDeleteError } = await supabase
    .from("installed_repositories")
    .delete()
    .in("installation_id", installationIds);

  if (repositoryDeleteError) {
    throw repositoryDeleteError;
  }

  const { error: installationUpdateError } = await supabase
    .from("github_app_installations")
    .update({
      status: "deleted",
      updated_at: new Date().toISOString(),
    })
    .in("installation_id", installationIds);

  if (installationUpdateError) {
    throw installationUpdateError;
  }

  return {
    disconnectedInstallationCount: installationIds.length,
  };
}
