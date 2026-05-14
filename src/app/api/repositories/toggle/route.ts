import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const toggleSchema = z.object({
  repositoryId: z.string().uuid(),
  isActiveForScanning: z.boolean(),
});

export async function POST(request: Request) {
  const payload = toggleSchema.parse(await request.json());
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("installed_repositories")
    .update({ is_active_for_scanning: payload.isActiveForScanning })
    .eq("id", payload.repositoryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
