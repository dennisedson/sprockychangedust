// @workflow_state: REVIEW
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { GitHubInstallationRepositoryRemovalError } from "@/lib/github/repositories";
import { removeInstalledRepositoryFromGitHubAndDatabase } from "@/lib/repositories/removeRepository";

export const dynamic = "force-dynamic";

const removeRepositorySchema = z.object({
  repositoryId: z.string().uuid(),
});

export async function POST(request: Request) {
  const payload = removeRepositorySchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid repository removal request." }, { status: 400 });
  }

  try {
    const result = await removeInstalledRepositoryFromGitHubAndDatabase(
      payload.data.repositoryId,
    );

    revalidatePath("/dashboard");
    revalidatePath("/repositories");

    return NextResponse.json({
      ok: true,
      repositoryName: result.repositoryName,
    });
  } catch (error) {
    if (error instanceof GitHubInstallationRepositoryRemovalError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 ? error.status : 500 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Repository removal failed." },
      { status: 500 },
    );
  }
}
