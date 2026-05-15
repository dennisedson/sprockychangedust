// @workflow_state: REVIEW
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { scanInstalledRepositoriesByInstallationId } from "@/lib/scanner/scanInstalledRepository";

export const dynamic = "force-dynamic";

const scanInstallationSchema = z.object({
  installationId: z.number().int().positive(),
});

export async function POST(request: Request) {
  const payload = scanInstallationSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid installation scan request." }, { status: 400 });
  }

  const outcomes = await scanInstalledRepositoriesByInstallationId(
    payload.data.installationId,
    { limit: 25 },
  );

  revalidatePath("/dashboard");
  revalidatePath("/repositories");

  return NextResponse.json({
    scanned: outcomes.filter((outcome) => outcome.result).length,
    failed: outcomes.filter((outcome) => outcome.error).length,
  });
}
