import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  emailAddress: z.string().email(),
  notifyViaEmail: z.boolean(),
  notifyViaGithubIssue: z.boolean(),
});

export async function POST(request: Request) {
  const payload = settingsSchema.parse(await request.json());
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("user_notification_settings").upsert(
    {
      user_id: user.id,
      email_address: payload.emailAddress,
      notify_via_email: payload.notifyViaEmail,
      notify_via_github_issue: payload.notifyViaGithubIssue,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
