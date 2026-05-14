"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { saveNotificationSettings } from "@/lib/notifications/settings";

const notificationSettingsFormSchema = z.object({
  emailAddress: z
    .preprocess((value) => (value === "" ? null : value), z.string().email().nullable()),
  notifyViaEmail: z.boolean(),
  notifyViaGithubIssue: z.boolean(),
});

export async function saveNotificationSettingsAction(formData: FormData) {
  const settings = notificationSettingsFormSchema.parse({
    emailAddress: formData.get("emailAddress"),
    notifyViaEmail: formData.has("notifyViaEmail"),
    notifyViaGithubIssue: formData.has("notifyViaGithubIssue"),
  });

  await saveNotificationSettings(settings);
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
