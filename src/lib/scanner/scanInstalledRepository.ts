import { fetchRepositoryScanFiles } from "@/lib/github/repositories";
import { scanRepositoryFiles } from "@/lib/scanner/scanRepositoryFiles";
import type { RepositoryScanResult } from "@/lib/scanner/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type InstalledRepositoryForScan = {
  id: string;
  installation_id: number;
  repo_name: string;
};

export type InstalledRepositoryScanOutcome = {
  repository: InstalledRepositoryForScan;
  result: RepositoryScanResult;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

type ScanOptions = {
  limit?: number;
};

export async function scanInstalledRepository(
  repository: InstalledRepositoryForScan,
): Promise<RepositoryScanResult> {
  const [owner, repo] = repository.repo_name.split("/");

  if (!owner || !repo) {
    const emptyResult = {
      hasHubSpotUsage: false,
      signals: [],
    };

    await saveRepositoryScanResult(repository.id, emptyResult);
    return emptyResult;
  }

  const files = await fetchRepositoryScanFiles({
    installationId: repository.installation_id,
    owner,
    repo,
  });
  const result = scanRepositoryFiles(files);

  await saveRepositoryScanResult(repository.id, result);

  return result;
}

export async function scanInstalledRepositoryById(repositoryId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: repository, error } = await supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name")
    .eq("id", repositoryId)
    .maybeSingle<InstalledRepositoryForScan>();

  if (error) {
    throw error;
  }

  if (!repository) {
    return null;
  }

  return {
    repository,
    result: await scanInstalledRepository(repository),
  };
}

export async function scanInstalledRepositories(options: ScanOptions = {}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name")
    .eq("is_active_for_scanning", true)
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: repositories, error } = await query.returns<InstalledRepositoryForScan[]>();

  if (error) {
    throw error;
  }

  return scanRepositoryRows(repositories);
}

export async function scanInstalledRepositoriesByGithubRepoIds(
  githubRepoIds: number[],
  options: ScanOptions = {},
) {
  if (githubRepoIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name")
    .in("github_repo_id", githubRepoIds)
    .eq("is_active_for_scanning", true)
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: repositories, error } = await query.returns<InstalledRepositoryForScan[]>();

  if (error) {
    throw error;
  }

  return scanRepositoryRows(repositories);
}

async function scanRepositoryRows(repositories: InstalledRepositoryForScan[]) {
  const outcomes: InstalledRepositoryScanOutcome[] = [];

  for (const repository of repositories) {
    outcomes.push({
      repository,
      result: await scanInstalledRepository(repository),
    });
  }

  return outcomes;
}

async function saveRepositoryScanResult(repositoryId: string, result: RepositoryScanResult) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .update({
      has_hubspot_usage: result.hasHubSpotUsage,
      latest_scan_signals: result.signals,
      last_scanned_at: new Date().toISOString(),
    })
    .eq("id", repositoryId);

  if (error) {
    if (isMissingRepositoryScanColumnError(error)) {
      const { error: fallbackError } = await supabase
        .from("installed_repositories")
        .update({
          last_scanned_at: new Date().toISOString(),
        })
        .eq("id", repositoryId);

      if (fallbackError) {
        throw fallbackError;
      }

      return;
    }

    throw error;
  }
}

export function isMissingRepositoryScanColumnError(error: SupabaseError) {
  return (
    error.code === "42703" ||
    error.message?.includes("has_hubspot_usage") ||
    error.message?.includes("latest_scan_signals") ||
    false
  );
}
