// @workflow_state: REVIEW
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getCurrentNotificationSettings,
  saveCurrentNotificationSettings,
} from "@/lib/notifications/settings";
import {
  saveCurrentUserProfile,
  userProfileInputSchema,
} from "@/lib/profile/userProfile";

const profileFormSchema = userProfileInputSchema.extend({
  emailAddress: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().email().nullable(),
  ),
});

export async function saveProfileAction(formData: FormData) {
  const profile = profileFormSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    emailAddress: formData.get("emailAddress"),
    title: formData.get("title"),
    company: formData.get("company"),
    location: formData.get("location"),
    githubUrl: formData.get("githubUrl"),
    bio: formData.get("bio"),
  });
  const { emailAddress, ...profileFields } = profile;
  const currentSettings = await getCurrentNotificationSettings();

  await saveCurrentUserProfile(profileFields);
  await saveCurrentNotificationSettings({
    ...currentSettings,
    emailAddress,
  });
  revalidatePath("/profile");
  revalidatePath("/settings");
  redirect("/profile?saved=1");
}

export async function signOutAllSessionsAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
