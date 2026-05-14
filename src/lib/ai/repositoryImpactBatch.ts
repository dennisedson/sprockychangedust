// @workflow_state: REVIEW
import { toFile } from "openai";
import {
  doesRepositoryManifestMatchProfile,
  getOrCreateChangelogImpactProfile,
} from "@/lib/ai/changelogImpactProfile";
import {
  createRepositoryImpactCacheKey,
  createRepositoryImpactResponseBody,
  parseRepositoryImpactResponseText,
  type RepositoryImpactAssessment,
  type RepositoryImpactInput,
} from "@/lib/ai/repositoryImpact";
import { getOpenAIBatchModel, getOpenAIClient } from "@/lib/ai/openaiClient";
import { scanInstalledRepository } from "@/lib/scanner/scanInstalledRepository";
import type { ScanSignal } from "@/lib/scanner/types";
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
  ai_summary: string;
  ai_severity_level: "red" | "amber" | "green";
  raw_content: string;
  migration_steps: string[] | null;
  impacted_keywords: string[] | null;
};

type CachedImpactRow = {
  analysis_cache_key: string | null;
};

type BatchJobRow = {
  id: string;
  openai_batch_id: string;
  requests: BatchRequestRecord[];
};

type BatchRequestRecord = {
  customId: string;
  changelogEntryId: string;
  installedRepositoryId: string;
  signals: ScanSignal[];
  analysisCacheKey: string;
};

type BatchOutputLine = {
  custom_id: string;
  response?: {
    status_code: number;
    body?: unknown;
  };
  error?: {
    message?: string;
  };
};

export async function enqueueRepositoryImpactBatch(changelogEntryId: string) {
  const openai = getOpenAIClient();

  if (!openai) {
    throw new Error("OPENAI_API_KEY is required to enqueue an AI batch.");
  }

  const supabase = createSupabaseAdminClient();
  const [entryResult, repositoryResult] = await Promise.all([
    supabase
      .from("changelog_entries")
      .select("id,title,ai_summary,ai_severity_level,raw_content,migration_steps,impacted_keywords")
      .eq("id", changelogEntryId)
      .single<ChangelogEntryRow>(),
    supabase
      .from("installed_repositories")
      .select("id,installation_id,repo_name,is_active_for_scanning")
      .eq("is_active_for_scanning", true)
      .returns<RepositoryRow[]>(),
  ]);

  if (entryResult.error) {
    throw entryResult.error;
  }

  if (repositoryResult.error) {
    throw repositoryResult.error;
  }

  const requests: BatchRequestRecord[] = [];
  const jsonlRequests: string[] = [];
  const skippedRepositories: string[] = [];
  const impactProfile = await getOrCreateChangelogImpactProfile({
    id: entryResult.data.id,
    title: entryResult.data.title,
    summary: entryResult.data.ai_summary,
    rawContent: entryResult.data.raw_content,
    migrationSteps: entryResult.data.migration_steps || [],
    impactedKeywords: entryResult.data.impacted_keywords || [],
  });

  for (const repository of repositoryResult.data) {
    const scanResult = await scanInstalledRepository(repository);
    const impactInput: RepositoryImpactInput = {
      repositoryName: repository.repo_name,
      changelog: {
        id: entryResult.data.id,
        title: entryResult.data.title,
        summary: entryResult.data.ai_summary,
        severity: entryResult.data.ai_severity_level,
        migrationSteps: entryResult.data.migration_steps || [],
        impactedKeywords: entryResult.data.impacted_keywords || [],
      },
      impactProfile,
      repositoryManifest: scanResult.manifest,
      signals: scanResult.signals,
    };
    const analysisCacheKey = createRepositoryImpactCacheKey(impactInput);
    const cached = await getCachedImpact({
      changelogEntryId: entryResult.data.id,
      installedRepositoryId: repository.id,
    });

    if (cached?.analysis_cache_key === analysisCacheKey) {
      skippedRepositories.push(repository.repo_name);
      continue;
    }

    if (!doesRepositoryManifestMatchProfile(impactProfile, scanResult.manifest)) {
      await upsertRepositoryImpact({
        changelogEntryId: entryResult.data.id,
        installedRepositoryId: repository.id,
        analysisCacheKey,
        assessment: {
          hasRelevantUsage: false,
          relevantSignals: [],
          confidence: 0.9,
          reason:
            "Repository manifest did not match the changelog impact profile.",
          analysisMethod: "profile",
        },
      });
      skippedRepositories.push(repository.repo_name);
      continue;
    }

    if (!scanResult.hasHubSpotUsage) {
      await upsertRepositoryImpact({
        changelogEntryId: entryResult.data.id,
        installedRepositoryId: repository.id,
        analysisCacheKey,
        assessment: {
          hasRelevantUsage: false,
          relevantSignals: [],
          confidence: 1,
          reason: "No HubSpot usage signals were detected in the repository.",
          analysisMethod: "scanner",
        },
      });
      skippedRepositories.push(repository.repo_name);
      continue;
    }

    const customId = `impact:${entryResult.data.id}:${repository.id}`;
    requests.push({
      customId,
      changelogEntryId: entryResult.data.id,
      installedRepositoryId: repository.id,
      signals: scanResult.signals,
      analysisCacheKey,
    });
    jsonlRequests.push(
      JSON.stringify({
        custom_id: customId,
        method: "POST",
        url: "/v1/responses",
        body: createRepositoryImpactResponseBody(impactInput, getOpenAIBatchModel()),
      }),
    );
  }

  if (jsonlRequests.length === 0) {
    return {
      batchId: null,
      enqueued: 0,
      skippedRepositories,
    };
  }

  const inputFile = await openai.files.create({
    file: await toFile(
      Buffer.from(jsonlRequests.join("\n")),
      `repository-impact-${changelogEntryId}.jsonl`,
    ),
    purpose: "batch",
  });
  const batch = await openai.batches.create({
    input_file_id: inputFile.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
    metadata: {
      job_type: "repository_impact",
      changelog_entry_id: changelogEntryId,
    },
  });
  const { error } = await supabase.from("ai_batch_jobs").insert({
    openai_batch_id: batch.id,
    input_file_id: inputFile.id,
    job_type: "repository_impact",
    status: batch.status,
    request_count: requests.length,
    requests,
  });

  if (error) {
    throw error;
  }

  return {
    batchId: batch.id,
    enqueued: requests.length,
    skippedRepositories,
  };
}

export async function syncRepositoryImpactBatches() {
  const openai = getOpenAIClient();

  if (!openai) {
    throw new Error("OPENAI_API_KEY is required to sync AI batches.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: jobs, error } = await supabase
    .from("ai_batch_jobs")
    .select("id,openai_batch_id,requests")
    .eq("job_type", "repository_impact")
    .not("status", "in", "(completed,failed,expired,cancelled)")
    .returns<BatchJobRow[]>();

  if (error) {
    throw error;
  }

  const processedJobs = [];

  for (const job of jobs) {
    const batch = await openai.batches.retrieve(job.openai_batch_id);

    await supabase
      .from("ai_batch_jobs")
      .update({
        status: batch.status,
        output_file_id: batch.output_file_id,
        error_message: batch.errors?.data?.[0]?.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (batch.status !== "completed" || !batch.output_file_id) {
      processedJobs.push({
        batchId: job.openai_batch_id,
        status: batch.status,
        processed: 0,
      });
      continue;
    }

    const fileResponse = await openai.files.content(batch.output_file_id);
    const output = await fileResponse.text();
    const requestByCustomId = new Map(
      job.requests.map((request) => [request.customId, request]),
    );
    let processed = 0;

    for (const line of output.split("\n")) {
      if (!line.trim()) {
        continue;
      }

      const parsed = JSON.parse(line) as BatchOutputLine;
      const request = requestByCustomId.get(parsed.custom_id);

      if (!request || parsed.error || parsed.response?.status_code !== 200) {
        continue;
      }

      const responseText = extractResponseOutputText(parsed.response.body);

      if (!responseText) {
        continue;
      }

      await upsertRepositoryImpact({
        changelogEntryId: request.changelogEntryId,
        installedRepositoryId: request.installedRepositoryId,
        analysisCacheKey: request.analysisCacheKey,
        assessment: parseRepositoryImpactResponseText(
          responseText,
          request.signals,
          "batch",
        ),
      });
      processed += 1;
    }

    await supabase
      .from("ai_batch_jobs")
      .update({
        status: batch.status,
        output_file_id: batch.output_file_id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    processedJobs.push({
      batchId: job.openai_batch_id,
      status: batch.status,
      processed,
    });
  }

  return { processedJobs };
}

async function getCachedImpact(input: {
  changelogEntryId: string;
  installedRepositoryId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("repository_impacts")
    .select("analysis_cache_key")
    .eq("changelog_entry_id", input.changelogEntryId)
    .eq("installed_repository_id", input.installedRepositoryId)
    .maybeSingle<CachedImpactRow>();

  if (error) {
    throw error;
  }

  return data;
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

function extractResponseOutputText(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const responseBody = body as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  if (responseBody.output_text) {
    return responseBody.output_text;
  }

  return responseBody.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text)
    .find((text): text is string => Boolean(text));
}
