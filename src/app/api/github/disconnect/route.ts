// @workflow_state: REVIEW
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { disconnectGitHubInstallations } from "@/lib/github/disconnect";
import { requireCurrentWorkspaceContext } from "@/lib/workspaces/currentWorkspace";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const context = await requireCurrentWorkspaceContext();
    const result = await disconnectGitHubInstallations(context);

    revalidatePath("/dashboard");
    revalidatePath("/repositories");
    revalidatePath("/settings");

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "GitHub disconnect failed.",
      },
      { status: 500 },
    );
  }
}
