// @workflow_state: REVIEW
import {
  doesRepositoryManifestMatchProfile,
  getOrCreateChangelogImpactProfile,
  mapRepositoryManifestRow,
  type RepositoryManifestRow,
} from "@/lib/ai/changelogImpactProfile";
import {
  assessRepositoryImpact,
  createRepositoryImpactCacheKey,
  type RepositoryImpactAssessment,
  type RepositoryImpactInput,
} from "@/lib/ai/repositoryImpact";
import {
  listExistingOpenTrackedIssues,
  recordTrackedIssue,
} from "@/lib/issues/trackedIssues";
import { sendImpactAlertEmail } from "@/lib/notifications/email";
import { createImpactIssue } from "@/lib/notifications/githubIssue";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { scanInstalledRepository } from "@/lib/scanner/scanInstalledRepository";
import type { RepositoryManifest, ScanSignal } from "@/lib/scanner/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RepositoryRow = {
  id: string;
  installation_id: number;
  repo_name: string;
  is_active_for_scanning: boolean;
};

type ChangelogEntryRow = {
  id: string;
  title: string;
  link: string;
  ai_summary: string;
  ai_severity_level: "red" | "amber" | "green";
  raw_content: string;
  migration_steps: string[] | null;
  impacted_keywords: string[] | null;
};

type CachedImpactRow = {
  has_hubspot_usage: boolean;
  scan_signals: ScanSignal[] | null;
  analysis_method: RepositoryImpactAssessment["analysisMethod"] | null;
  analysis_cache_key: string | null;
  match_reason: string | null;
  match_confidence: number | null;
};

type GitHubIssueLabel =
  | string
  | {
      name?: string | null;
    };

type GitHubIssueAssignee = {
  login?: string | null;
};

type DispatchImpactNotificationsOptions = {
  forceFreshScan?: boolean;
};

export async function dispatchImpactNotifications(
  changelogEntryId: string,
  options: DispatchImpactNotificationsOptions = {},
) {
  const supabase = createSupabaseAdminClient();
  const { data: entry, error: entryError } = await supabase
    .from("changelog_entries")
    .select(
      "id,title,link,ai_summary,ai_severity_level,raw_content,migration_steps,impacted_keywords",
    )
    .eq("id", changelogEntryId)
    .single<ChangelogEntryRow>();

  if (entryError) {
    throw entryError;
  }

  const { data: repositories, error: repositoryError } = await supabase
    .from("installed_repositories")
    .select("id,installation_id,repo_name,is_active_for_scanning")
    .eq("is_active_for_scanning", true)
    .returns<RepositoryRow[]>();

  if (repositoryError) {
    throw repositoryError;
  }

  const notifiedRepositories: string[] = [];
  const settings = await getNotificationSettings();
  const impactProfile = await getOrCreateChangelogImpactProfile({
    id: entry.id,
    title: entry.title,
    summary: entry.ai_summary,
    rawContent: entry.raw_content,
    migrationSteps: entry.migration_steps || [],
    impactedKeywords: entry.impacted_keywords || [],
  });
  const manifestByRepositoryId = await getRepositoryManifestMap(
    repositories.map((repository) => repository.id),
  );

  for (const repository of repositories) {
    const [owner, repo] = repository.repo_name.split("/");

    if (!owner || !repo) {
      continue;
    }

    const storedManifest = manifestByRepositoryId.get(repository.id);

    if (
      !options.forceFreshScan &&
      storedManifest &&
      !doesRepositoryManifestMatchProfile(impactProfile, storedManifest)
    ) {
      await upsertProfileFilteredImpact({
        entry,
        repositoryName: repository.repo_name,
        installedRepositoryId: repository.id,
        impactProfile,
        repositoryManifest: storedManifest,
        reason: "Repository manifest did not match the changelog impact profile.",
        confidence: 0.86,
      });
      continue;
    }

    const result = await scanInstalledRepository(repository);
    const impactInput = createRepositoryImpactInput({
      entry,
      repositoryName: repository.repo_name,
      impactProfile,
      repositoryManifest: result.manifest,
      signals: result.signals,
    });

    if (!doesRepositoryManifestMatchProfile(impactProfile, result.manifest)) {
      await upsertProfileFilteredImpact({
        entry,
        repositoryName: repository.repo_name,
        installedRepositoryId: repository.id,
        impactProfile,
        repositoryManifest: result.manifest,
        reason: "Fresh repository manifest did not match the changelog impact profile.",
        confidence: 0.9,
      });
      continue;
    }

    const analysisCacheKey = createRepositoryImpactCacheKey(impactInput);
    const cachedAssessment = await getCachedImpactAssessment({
      changelogEntryId: entry.id,
      installedRepositoryId: repository.id,
      analysisCacheKey,
    });
    const assessment =
      cachedAssessment ||
      (result.hasHubSpotUsage
        ? await assessRepositoryImpact(impactInput)
        : {
            hasRelevantUsage: false,
            relevantSignals: [],
            confidence: 1,
            reason: "No HubSpot usage signals were detected in the repository.",
            analysisMethod: "scanner" as const,
          });

    await upsertRepositoryImpact({
      changelogEntryId: entry.id,
      installedRepositoryId: repository.id,
      assessment,
      analysisCacheKey,
    });

    if (!assessment.hasRelevantUsage) {
      continue;
    }

    const existingIssues = settings.notifyViaGithubIssue
      ? await listExistingOpenTrackedIssues({
          changelogEntryId: entry.id,
          repositoryIds: [repository.id],
        })
      : [];

    if (existingIssues.length > 0) {
      notifiedRepositories.push(repository.repo_name);
      continue;
    }

    if (settings.notifyViaEmail && settings.emailAddress) {
      await sendImpactAlertEmail({
        to: settings.emailAddress,
        changelogTitle: entry.title,
        changelogUrl: entry.link,
        severity: entry.ai_severity_level,
        summary: entry.ai_summary,
        repositoryName: repository.repo_name,
        signals: assessment.relevantSignals,
      });
    }

    if (settings.notifyViaGithubIssue) {
      const issue = await createImpactIssue({
        installationId: repository.installation_id,
        owner,
        repo,
        changelogTitle: entry.title,
        changelogUrl: entry.link,
        summary: entry.ai_summary,
        severity: entry.ai_severity_level,
        migrationSteps: entry.migration_steps || [],
        signals: assessment.relevantSignals,
      });
      await recordTrackedIssue({
        changelogEntryId: entry.id,
        installedRepositoryId: repository.id,
        githubIssueId: issue.data.id,
        githubIssueNumber: issue.data.number,
        githubIssueUrl: issue.data.html_url,
        githubIssueState: issue.data.state === "closed" ? "closed" : "open",
        assignees: mapIssueAssignees(issue.data.assignees),
        labels: mapIssueLabels(issue.data.labels),
        closedAt: issue.data.closed_at,
      });
    }

    notifiedRepositories.push(repository.repo_name);
  }

  const { error: statusError } = await supabase
    .from("changelog_entries")
    .update({ status: "notified" })
    .eq("id", changelogEntryId);

  if (statusError) {
    throw statusError;
  }

  return { notifiedRepositories };
}

function createRepositoryImpactInput(input: {
  entry: ChangelogEntryRow;
  repositoryName: string;
  impactProfile: RepositoryImpactInput["impactProfile"];
  repositoryManifest: RepositoryManifest;
  signals: ScanSignal[];
}): RepositoryImpactInput {
  return {
    repositoryName: input.repositoryName,
    impactProfile: input.impactProfile,
    repositoryManifest: input.repositoryManifest,
    changelog: {
      id: input.entry.id,
      title: input.entry.title,
      summary: input.entry.ai_summary,
      severity: input.entry.ai_severity_level,
      migrationSteps: input.entry.migration_steps || [],
      impactedKeywords: input.entry.impacted_keywords || [],
    },
    signals: input.signals,
  };
}

async function getRepositoryManifestMap(repositoryIds: string[]) {
  if (repositoryIds.length === 0) {
    return new Map<string, RepositoryManifest>();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("repository_manifests")
    .select(
      "installed_repository_id,platform_versions,api_paths,api_version_segments,sdk_packages,sdk_symbols,scopes,file_markers,product_areas,evidence",
    )
    .in("installed_repository_id", repositoryIds)
    .returns<RepositoryManifestRow[]>();

  if (error) {
    return new Map<string, RepositoryManifest>();
  }

  return new Map(
    data.map((row) => [row.installed_repository_id, mapRepositoryManifestRow(row)]),
  );
}

async function upsertProfileFilteredImpact(input: {
  entry: ChangelogEntryRow;
  repositoryName: string;
  installedRepositoryId: string;
  impactProfile: RepositoryImpactInput["impactProfile"];
  repositoryManifest: RepositoryManifest;
  reason: string;
  confidence: number;
}) {
  const impactInput = createRepositoryImpactInput({
    entry: input.entry,
    repositoryName: input.repositoryName,
    impactProfile: input.impactProfile,
    repositoryManifest: input.repositoryManifest,
    signals: [],
  });

  await upsertRepositoryImpact({
    changelogEntryId: input.entry.id,
    installedRepositoryId: input.installedRepositoryId,
    analysisCacheKey: createRepositoryImpactCacheKey(impactInput),
    assessment: {
      hasRelevantUsage: false,
      relevantSignals: [],
      confidence: input.confidence,
      reason: input.reason,
      analysisMethod: "profile",
    },
  });
}

async function getCachedImpactAssessment(input: {
  changelogEntryId: string;
  installedRepositoryId: string;
  analysisCacheKey: string;
}): Promise<RepositoryImpactAssessment | undefined> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("repository_impacts")
    .select(
      "has_hubspot_usage,scan_signals,analysis_method,analysis_cache_key,match_reason,match_confidence",
    )
    .eq("changelog_entry_id", input.changelogEntryId)
    .eq("installed_repository_id", input.installedRepositoryId)
    .maybeSingle<CachedImpactRow>();

  if (error || !data || data.analysis_cache_key !== input.analysisCacheKey) {
    return undefined;
  }

  return {
    hasRelevantUsage: data.has_hubspot_usage,
    relevantSignals: data.scan_signals || [],
    confidence: Number(data.match_confidence ?? 0.8),
    reason: data.match_reason || "Cached repository impact assessment.",
    analysisMethod: data.analysis_method || "scanner",
  };
}

async function upsertRepositoryImpact(input: {
  changelogEntryId: string;
  installedRepositoryId: string;
  assessment: RepositoryImpactAssessment;
  analysisCacheKey: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("repository_impacts").upsert(
    {
      changelog_entry_id: input.changelogEntryId,
      installed_repository_id: input.installedRepositoryId,
      has_hubspot_usage: input.assessment.hasRelevantUsage,
      scan_signals: input.assessment.relevantSignals,
      analysis_method: input.assessment.analysisMethod,
      analysis_cache_key: input.analysisCacheKey,
      match_reason: input.assessment.reason,
      match_confidence: input.assessment.confidence,
    },
    { onConflict: "changelog_entry_id,installed_repository_id" },
  );

  if (error) {
    throw error;
  }
}

function mapIssueAssignees(assignees?: GitHubIssueAssignee[] | null) {
  return (assignees || [])
    .map((assignee) => assignee.login)
    .filter((login): login is string => Boolean(login));
}

function mapIssueLabels(labels?: GitHubIssueLabel[] | null) {
  return (labels || [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((label): label is string => Boolean(label));
}
