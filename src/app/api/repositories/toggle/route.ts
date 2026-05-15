// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isRepositoryInCurrentWorkspace,
  requireCurrentWorkspaceContext,
} from "@/lib/workspaces/currentWorkspace";

export const dynamic = "force-dynamic";

const toggleSchema = z.object({
  repositoryId: z.string().uuid(),
  isActiveForScanning: z.boolean(),
});

export async function POST(request: Request) {
  const payload = toggleSchema.parse(await request.json());
  const context = await requireCurrentWorkspaceContext();

  if (!(await isRepositoryInCurrentWorkspace(payload.repositoryId, context))) {
    return NextResponse.json({ error: "Repository was not found." }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("installed_repositories")
    .update({ is_active_for_scanning: payload.isActiveForScanning })
    .eq("id", payload.repositoryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
