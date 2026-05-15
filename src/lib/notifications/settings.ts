// @workflow_state: REVIEW
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  type CurrentWorkspaceContext,
  requireCurrentWorkspaceContext,
} from "@/lib/workspaces/currentWorkspace";

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

type InstallationOwnerRow = {
  user_id: string | null;
  workspace_id?: string | null;
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

  return mapSettingsRow(data);
}

export async function getCurrentNotificationSettings() {
  const context = await requireCurrentWorkspaceContext();
  return getNotificationSettingsForContext(context);
}

export async function saveCurrentNotificationSettings(settings: NotificationSettings) {
  const context = await requireCurrentWorkspaceContext();
  const parsed = notificationSettingsSchema.parse(settings);
  await saveUserNotificationSettings(context, parsed);
}

export async function getNotificationSettingsForInstallation(installationId: number) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("github_app_installations")
    .select("user_id,workspace_id")
    .eq("installation_id", installationId)
    .maybeSingle<InstallationOwnerRow>();

  if (!error) {
    if (!data?.user_id) {
      return getNotificationSettings();
    }

    return getUserNotificationSettings({
      userId: data.user_id,
      workspaceId: data.workspace_id || null,
    });
  }

  if (!isMissingWorkspaceColumnError(error)) {
    throw error;
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("github_app_installations")
    .select("user_id")
    .eq("installation_id", installationId)
    .maybeSingle<InstallationOwnerRow>();

  if (fallbackError || !fallbackData?.user_id) {
    return getNotificationSettings();
  }

  return getUserNotificationSettings({
    userId: fallbackData.user_id,
    workspaceId: null,
  });
}

async function getNotificationSettingsForContext(context: CurrentWorkspaceContext) {
  return getUserNotificationSettings({
    userId: context.user.id,
    workspaceId: context.workspaceId,
  });
}

async function getUserNotificationSettings(input: {
  userId: string;
  workspaceId: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("user_notification_settings")
    .select("email_address,notify_via_email,notify_via_github_issue")
    .eq("user_id", input.userId);

  if (input.workspaceId) {
    query = query.eq("workspace_id", input.workspaceId);
  }

  const { data, error } = await query
    .limit(1)
    .maybeSingle<NotificationSettingsRow>();

  if (!error) {
    if (data) {
      return mapSettingsRow(data);
    }

    return getNotificationSettings();
  }

  if (input.workspaceId && isMissingWorkspaceColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("user_notification_settings")
      .select("email_address,notify_via_email,notify_via_github_issue")
      .eq("user_id", input.userId)
      .maybeSingle<NotificationSettingsRow>();

    if (!fallbackError) {
      return fallbackData ? mapSettingsRow(fallbackData) : getNotificationSettings();
    }
  }

  if (isMissingUserSettingsTableError(error)) {
    return getNotificationSettings();
  }

  throw error;
}

async function saveUserNotificationSettings(
  context: CurrentWorkspaceContext,
  settings: NotificationSettings,
) {
  const supabase = createSupabaseAdminClient();
  const payload: {
    email_address: string | null;
    notify_via_email: boolean;
    notify_via_github_issue: boolean;
    updated_at: string;
    user_id: string;
    workspace_id?: string | null;
  } = {
    email_address: settings.emailAddress,
    notify_via_email: settings.notifyViaEmail,
    notify_via_github_issue: settings.notifyViaGithubIssue,
    updated_at: new Date().toISOString(),
    user_id: context.user.id,
  };

  if (context.workspaceId) {
    payload.workspace_id = context.workspaceId;
  }

  const { error } = await supabase.from("user_notification_settings").upsert(
    payload,
    {
      onConflict: context.workspaceId ? "user_id,workspace_id" : "user_id",
    },
  );

  if (!error) {
    return;
  }

  if (context.workspaceId && isMissingWorkspaceColumnError(error)) {
    const { error: fallbackError } = await supabase
      .from("user_notification_settings")
      .upsert(
        {
          email_address: settings.emailAddress,
          notify_via_email: settings.notifyViaEmail,
          notify_via_github_issue: settings.notifyViaGithubIssue,
          updated_at: new Date().toISOString(),
          user_id: context.user.id,
        },
        { onConflict: "user_id" },
      );

    if (fallbackError) {
      throw fallbackError;
    }

    return;
  }

  throw error;
}

function mapSettingsRow(row: NotificationSettingsRow | null): NotificationSettings {
  if (!row) {
    return defaultSettings;
  }

  return {
    emailAddress: row.email_address,
    notifyViaEmail: row.notify_via_email,
    notifyViaGithubIssue: row.notify_via_github_issue,
  };
}

function isMissingSettingsTableError(error: SupabaseError) {
  return (
    error.code === "42P01" ||
    error.message?.includes("app_notification_settings") ||
    false
  );
}

function isMissingUserSettingsTableError(error: SupabaseError) {
  return (
    error.code === "42P01" ||
    error.message?.includes("user_notification_settings") ||
    false
  );
}

function isMissingWorkspaceColumnError(error: SupabaseError) {
  return (
    error.code === "42703" ||
    error.message?.includes("workspace_id") ||
    false
  );
}
