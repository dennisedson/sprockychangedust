// @workflow_state: REVIEW
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  saveCurrentUserProfile,
  userProfileInputSchema,
} from "@/lib/profile/userProfile";

export async function saveProfileAction(formData: FormData) {
  const profile = userProfileInputSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    title: formData.get("title"),
    company: formData.get("company"),
    location: formData.get("location"),
    githubUrl: formData.get("githubUrl"),
    bio: formData.get("bio"),
  });

  await saveCurrentUserProfile(profile);
  revalidatePath("/profile");
  redirect("/profile?saved=1");
}

export async function signOutAllSessionsAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
