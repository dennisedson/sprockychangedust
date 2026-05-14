"use server";

import { revalidatePath } from "next/cache";
import {
  scanInstalledRepositories,
  scanInstalledRepositoryById,
} from "@/lib/scanner/scanInstalledRepository";

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
