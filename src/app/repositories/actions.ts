// @workflow_state: REVIEW
"use server";

import { revalidatePath } from "next/cache";
import { checkRepositoryAgainstStoredChangelogs } from "@/lib/changelog/monitor";
import {
  scanInstalledRepositories,
  scanInstalledRepositoryById,
} from "@/lib/scanner/scanInstalledRepository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MonitoringStatus = "pending" | "watched" | "ignored";

export async function scanAllRepositoriesAction() {
  await scanInstalledRepositories();
  revalidatePath("/repositories");
}

export async function scanRepositoryAction(formData: FormData) {
  const repositoryId = formData.get("repositoryId");

  if (typeof repositoryId !== "string" || repositoryId.length === 0) {
    return;
  }

  await scanInstalledRepositoryById(repositoryId);
  revalidatePath("/repositories");
}

export async function disconnectRepositoryAction(formData: FormData) {
  await updateRepositoryConnection(formData, false);
}

export async function reconnectRepositoryAction(formData: FormData) {
  await updateRepositoryConnection(formData, true);
}

export async function removeRepositoryAction(formData: FormData) {
  const repositoryId = formData.get("repositoryId");

  if (typeof repositoryId !== "string" || repositoryId.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .delete()
    .eq("id", repositoryId);

  if (error) {
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/repositories");
}

export async function watchRepositoryAction(formData: FormData) {
  const repositoryId = await updateRepositoryMonitoringStatus(formData, "watched");

  if (!repositoryId) {
    return;
  }

  await scanInstalledRepositoryById(repositoryId);
  await checkRepositoryAgainstStoredChangelogs({
    repositoryId,
    limit: 20,
  });
  revalidatePath("/dashboard");
}

export async function ignoreRepositoryAction(formData: FormData) {
  await updateRepositoryMonitoringStatus(formData, "ignored");
}

async function updateRepositoryConnection(formData: FormData, isActiveForScanning: boolean) {
  const repositoryId = formData.get("repositoryId");

  if (typeof repositoryId !== "string" || repositoryId.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .update({ is_active_for_scanning: isActiveForScanning })
    .eq("id", repositoryId);

  if (error) {
    throw error;
  }

  revalidatePath("/repositories");
}

async function updateRepositoryMonitoringStatus(
  formData: FormData,
  monitoringStatus: MonitoringStatus,
) {
  const repositoryId = formData.get("repositoryId");

  if (typeof repositoryId !== "string" || repositoryId.length === 0) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .update({ monitoring_status: monitoringStatus })
    .eq("id", repositoryId);

  if (error) {
    throw error;
  }

  revalidatePath("/repositories");
  return repositoryId;
}
