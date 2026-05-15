// @workflow_state: REVIEW
import crypto from "node:crypto";
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
  result?: RepositoryScanResult;
  error?: string;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

type ScanOptions = {
  installationId?: number;
  installationIds?: number[];
  limit?: number;
};

export async function scanInstalledRepository(
  repository: InstalledRepositoryForScan,
): Promise<RepositoryScanResult> {
  await setRepositoryScanStatus(repository.id, "scanning");

  try {
    const [owner, repo] = repository.repo_name.split("/");

    if (!owner || !repo) {
      const emptyResult: RepositoryScanResult = {
        hasHubSpotUsage: false,
        signals: [],
        manifest: {
          platformVersions: [],
          apiPaths: [],
          apiVersionSegments: [],
          sdkPackages: [],
          sdkSymbols: [],
          scopes: [],
          fileMarkers: [],
          productAreas: [],
          evidence: [],
        },
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
  } catch (error) {
    await setRepositoryScanStatus(repository.id, "failed", getErrorMessage(error));
    throw error;
  }
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
  if (options.installationIds?.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name")
    .eq("is_active_for_scanning", true)
    .order("created_at", { ascending: false });

  if (options.installationIds) {
    query = query.in("installation_id", options.installationIds);
  } else if (options.installationId) {
    query = query.eq("installation_id", options.installationId);
  }

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

export async function scanInstalledRepositoriesByInstallationId(
  installationId: number,
  options: ScanOptions = {},
) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name")
    .eq("installation_id", installationId)
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

export async function scanQueuedInstalledRepositories(options: ScanOptions = {}) {
  if (options.installationIds?.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name")
    .eq("is_active_for_scanning", true)
    .eq("scan_status", "pending")
    .order("created_at", { ascending: true });

  if (options.installationIds) {
    query = query.in("installation_id", options.installationIds);
  } else if (options.installationId) {
    query = query.eq("installation_id", options.installationId);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: repositories, error } = await query.returns<InstalledRepositoryForScan[]>();

  if (error) {
    throw error;
  }

  return scanRepositoryRows(repositories);
}

export async function countQueuedInstalledRepositoryScans(
  options: Pick<ScanOptions, "installationId" | "installationIds"> = {},
) {
  if (options.installationIds?.length === 0) {
    return 0;
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("installed_repositories")
    .select("id", { count: "exact", head: true })
    .eq("is_active_for_scanning", true)
    .eq("scan_status", "pending");

  if (options.installationIds) {
    query = query.in("installation_id", options.installationIds);
  } else if (options.installationId) {
    query = query.eq("installation_id", options.installationId);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count || 0;
}

async function scanRepositoryRows(repositories: InstalledRepositoryForScan[]) {
  const outcomes: InstalledRepositoryScanOutcome[] = [];

  for (const repository of repositories) {
    try {
      outcomes.push({
        repository,
        result: await scanInstalledRepository(repository),
      });
    } catch (error) {
      outcomes.push({
        repository,
        error: getErrorMessage(error),
      });
    }
  }

  return outcomes;
}

async function saveRepositoryScanResult(repositoryId: string, result: RepositoryScanResult) {
  const supabase = createSupabaseAdminClient();
  const [{ error }, { error: manifestError }] = await Promise.all([
    supabase
      .from("installed_repositories")
      .update({
        has_hubspot_usage: result.hasHubSpotUsage,
        latest_scan_signals: result.signals,
        last_scanned_at: new Date().toISOString(),
        last_scan_error: null,
        scan_status: "complete",
      })
      .eq("id", repositoryId),
    supabase.from("repository_manifests").upsert({
      installed_repository_id: repositoryId,
      manifest_hash: hashManifest(result.manifest),
      platform_versions: result.manifest.platformVersions,
      api_paths: result.manifest.apiPaths,
      api_version_segments: result.manifest.apiVersionSegments,
      sdk_packages: result.manifest.sdkPackages,
      sdk_symbols: result.manifest.sdkSymbols,
      scopes: result.manifest.scopes,
      file_markers: result.manifest.fileMarkers,
      product_areas: result.manifest.productAreas,
      evidence: result.manifest.evidence,
      updated_at: new Date().toISOString(),
    }),
  ]);

  if (error) {
    if (isMissingRepositoryScanStatusColumnError(error)) {
      const { error: fallbackError } = await supabase
        .from("installed_repositories")
        .update({
          has_hubspot_usage: result.hasHubSpotUsage,
          latest_scan_signals: result.signals,
          last_scanned_at: new Date().toISOString(),
        })
        .eq("id", repositoryId);

      if (fallbackError) {
        throw fallbackError;
      }

      return;
    }

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

  if (manifestError && !isMissingRepositoryManifestTableError(manifestError)) {
    throw manifestError;
  }
}

async function setRepositoryScanStatus(
  repositoryId: string,
  scanStatus: "pending" | "scanning" | "complete" | "failed",
  lastScanError: string | null = null,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .update({
      last_scan_error: lastScanError,
      scan_status: scanStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", repositoryId);

  if (error && !isMissingRepositoryScanStatusColumnError(error)) {
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

function isMissingRepositoryScanStatusColumnError(error: SupabaseError) {
  return (
    error.message?.includes("scan_status") ||
    error.message?.includes("last_scan_error") ||
    false
  );
}

function isMissingRepositoryManifestTableError(error: SupabaseError) {
  return (
    error.code === "42P01" ||
    error.message?.includes("repository_manifests") ||
    false
  );
}

function hashManifest(manifest: RepositoryScanResult["manifest"]) {
  return crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Repository scan failed.";
}
