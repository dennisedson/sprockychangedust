// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import { z } from "zod";
import { createImpactIssue } from "@/lib/notifications/githubIssue";
import type { ScanSignal } from "@/lib/scanner/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const issueRequestSchema = z.object({
  changelogEntryId: z.string().uuid(),
  repositoryIds: z.array(z.string().uuid()).min(1).max(25),
});

type ChangelogEntryRow = {
  id: string;
  title: string;
  link: string;
  ai_summary: string | null;
  ai_severity_level: "red" | "amber" | "green" | null;
  migration_steps: string[] | null;
};

type RepositoryRow = {
  id: string;
  installation_id: number;
  repo_name: string;
  is_active_for_scanning: boolean;
  latest_scan_signals: ScanSignal[] | null;
};

type RepositoryImpactRow = {
  installed_repository_id: string;
  scan_signals: ScanSignal[] | null;
};

export async function POST(request: Request) {
  const payload = issueRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid issue request." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { changelogEntryId, repositoryIds } = payload.data;

  const [entryResult, repositoryResult, impactResult] = await Promise.all([
    supabase
      .from("changelog_entries")
      .select("id,title,link,ai_summary,ai_severity_level,migration_steps")
      .eq("id", changelogEntryId)
      .single<ChangelogEntryRow>(),
    supabase
      .from("installed_repositories")
      .select("id,installation_id,repo_name,is_active_for_scanning,latest_scan_signals")
      .in("id", repositoryIds)
      .returns<RepositoryRow[]>(),
    supabase
      .from("repository_impacts")
      .select("installed_repository_id,scan_signals")
      .eq("changelog_entry_id", changelogEntryId)
      .in("installed_repository_id", repositoryIds)
      .eq("has_hubspot_usage", true)
      .order("created_at", { ascending: false })
      .returns<RepositoryImpactRow[]>(),
  ]);

  if (entryResult.error) {
    return NextResponse.json({ error: "Changelog entry was not found." }, { status: 404 });
  }

  if (repositoryResult.error) {
    return NextResponse.json({ error: "Repository was not found." }, { status: 404 });
  }

  if (impactResult.error) {
    return NextResponse.json({ error: "Repository impact lookup failed." }, { status: 500 });
  }

  if (repositoryResult.data.length === 0) {
    return NextResponse.json({ error: "No repositories were found." }, { status: 404 });
  }

  const impactSignalsByRepositoryId = new Map<string, ScanSignal[]>();

  for (const impact of impactResult.data) {
    if (!impactSignalsByRepositoryId.has(impact.installed_repository_id)) {
      impactSignalsByRepositoryId.set(impact.installed_repository_id, impact.scan_signals || []);
    }
  }

  const createdIssues: Array<{
    issueNumber: number;
    issueUrl: string;
    repositoryName: string;
  }> = [];
  const errors: Array<{ repositoryName: string; error: string }> = [];

  for (const repository of repositoryResult.data) {
    if (!repository.is_active_for_scanning) {
      errors.push({
        repositoryName: repository.repo_name,
        error: "Repository is disconnected.",
      });
      continue;
    }

    const [owner, repo] = repository.repo_name.split("/");

    if (!owner || !repo) {
      errors.push({
        repositoryName: repository.repo_name,
        error: "Repository name is invalid.",
      });
      continue;
    }

    try {
      const issue = await createImpactIssue({
        installationId: repository.installation_id,
        owner,
        repo,
        changelogTitle: entryResult.data.title,
        changelogUrl: entryResult.data.link,
        summary: entryResult.data.ai_summary || "Review the linked HubSpot changelog entry.",
        severity: entryResult.data.ai_severity_level || "green",
        migrationSteps: entryResult.data.migration_steps || [],
        signals:
          impactSignalsByRepositoryId.get(repository.id) || repository.latest_scan_signals || [],
      });

      createdIssues.push({
        issueNumber: issue.data.number,
        issueUrl: issue.data.html_url,
        repositoryName: repository.repo_name,
      });
    } catch (error) {
      console.error(error);
      errors.push({
        repositoryName: repository.repo_name,
        error: "GitHub issue creation failed.",
      });
    }
  }

  if (createdIssues.length === 0) {
    return NextResponse.json(
      {
        error: errors[0]?.error || "No issues were created.",
        errors,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    createdIssues,
    errors,
  });
}
