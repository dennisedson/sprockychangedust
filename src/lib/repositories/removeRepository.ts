// @workflow_state: REVIEW
import { removeRepositoryFromInstallation } from "@/lib/github/repositories";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type InstalledRepositoryRemovalRow = {
  id: string;
  installation_id: number;
  github_repo_id: number;
  repo_name: string;
};

export async function removeInstalledRepositoryFromGitHubAndDatabase(repositoryId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: repository, error: repositoryError } = await supabase
    .from("installed_repositories")
    .select("id,installation_id,github_repo_id,repo_name")
    .eq("id", repositoryId)
    .single<InstalledRepositoryRemovalRow>();

  if (repositoryError || !repository) {
    throw new Error("Repository was not found.");
  }

  await removeRepositoryFromInstallation({
    installationId: repository.installation_id,
    githubRepositoryId: repository.github_repo_id,
  });

  const { error: deleteError } = await supabase
    .from("installed_repositories")
    .delete()
    .eq("id", repository.id);

  if (deleteError) {
    throw deleteError;
  }

  return {
    repositoryName: repository.repo_name,
  };
}
