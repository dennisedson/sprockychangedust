// @workflow_state: REVIEW
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  countQueuedInstalledRepositoryScans,
  scanQueuedInstalledRepositories,
} from "@/lib/scanner/scanInstalledRepository";

export const dynamic = "force-dynamic";

const defaultBatchSize = 5;

const scanInstallationSchema = z.object({
  installationId: z.number().int().positive().nullable().optional(),
  limit: z.number().int().positive().max(25).optional(),
});

export async function POST(request: Request) {
  const payload = scanInstallationSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid installation scan request." }, { status: 400 });
  }

  const installationId = payload.data.installationId || undefined;
  const limit = payload.data.limit || defaultBatchSize;
  const queuedBefore = await countQueuedInstalledRepositoryScans({ installationId });
  const outcomes = await scanQueuedInstalledRepositories({ installationId, limit });
  const remaining = await countQueuedInstalledRepositoryScans({ installationId });

  revalidatePath("/dashboard");
  revalidatePath("/repositories");

  return NextResponse.json({
    queuedBefore,
    scanned: outcomes.filter((outcome) => outcome.result).length,
    failed: outcomes.filter((outcome) => outcome.error).length,
    remaining,
  });
}
