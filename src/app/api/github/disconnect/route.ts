// @workflow_state: REVIEW
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { disconnectGitHubInstallations } from "@/lib/github/disconnect";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await disconnectGitHubInstallations();

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
