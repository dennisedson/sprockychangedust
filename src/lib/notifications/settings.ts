// @workflow_state: REVIEW
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const notificationSettingsSchema = z.object({
  emailAddress: z.string().email().nullable(),
  notifyViaEmail: z.boolean(),
  notifyViaGithubIssue: z.boolean(),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

type NotificationSettingsRow = {
  email_address: string | null;
  notify_via_email: boolean;
  notify_via_github_issue: boolean;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

const defaultSettings: NotificationSettings = {
  emailAddress: null,
  notifyViaEmail: true,
  notifyViaGithubIssue: false,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_notification_settings")
    .select("email_address,notify_via_email,notify_via_github_issue")
    .eq("id", true)
    .maybeSingle<NotificationSettingsRow>();

  if (error) {
    if (isMissingSettingsTableError(error)) {
      return defaultSettings;
    }

    throw error;
  }

  if (!data) {
    return defaultSettings;
  }

  return {
    emailAddress: data.email_address,
    notifyViaEmail: data.notify_via_email,
    notifyViaGithubIssue: data.notify_via_github_issue,
  };
}

export async function saveNotificationSettings(settings: NotificationSettings) {
  const supabase = createSupabaseAdminClient();
  const parsed = notificationSettingsSchema.parse(settings);
  const { error } = await supabase.from("app_notification_settings").upsert(
    {
      id: true,
      email_address: parsed.emailAddress,
      notify_via_email: parsed.notifyViaEmail,
      notify_via_github_issue: parsed.notifyViaGithubIssue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw error;
  }
}

function isMissingSettingsTableError(error: SupabaseError) {
  return (
    error.code === "42P01" ||
    error.message?.includes("app_notification_settings") ||
    false
  );
}
