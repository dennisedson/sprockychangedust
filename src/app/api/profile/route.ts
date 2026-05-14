import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  githubUrl: z.string().url().optional().or(z.literal("")),
  bio: z.string().optional(),
});

export async function POST(request: Request) {
  const payload = profileSchema.parse(await request.json());
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      first_name: payload.firstName,
      last_name: payload.lastName,
      title: payload.title || null,
      company: payload.company || null,
      location: payload.location || null,
      github_url: payload.githubUrl || null,
      bio: payload.bio || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
