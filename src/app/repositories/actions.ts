"use server";

import { revalidatePath } from "next/cache";
import {
  scanInstalledRepositories,
  scanInstalledRepositoryById,
} from "@/lib/scanner/scanInstalledRepository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
