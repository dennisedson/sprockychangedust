// @workflow_state: REVIEW
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type CurrentUser, requireCurrentUser } from "@/lib/auth/currentUser";

export type CurrentWorkspaceContext = {
  user: CurrentUser;
  workspaceId: string | null;
};

type WorkspaceMembershipRow = {
  workspace_id: string;
};

type WorkspaceRow = {
  id: string;
};

type InstallationRow = {
  installation_id: number;
};

type RepositoryRow = {
  id: string;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

export async function requireCurrentWorkspaceContext(): Promise<CurrentWorkspaceContext> {
  const user = await requireCurrentUser();
  const workspaceId = await ensurePersonalWorkspace(user);

  await adoptUnownedInstallations({
    user,
    workspaceId,
  });

  return {
    user,
    workspaceId,
  };
}

export async function listCurrentWorkspaceInstallationIds(
  context: CurrentWorkspaceContext,
) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("github_app_installations")
    .select("installation_id")
    .eq("status", "active");

  if (context.workspaceId) {
    query = query.eq("workspace_id", context.workspaceId);
  } else {
    query = query.eq("user_id", context.user.id);
  }

  const { data, error } = await query.returns<InstallationRow[]>();

  if (!error) {
    return data.map((installation) => installation.installation_id);
  }

  if (context.workspaceId && isMissingWorkspaceColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("github_app_installations")
      .select("installation_id")
      .eq("status", "active")
      .eq("user_id", context.user.id)
      .returns<InstallationRow[]>();

    if (fallbackError) {
      throw fallbackError;
    }

    return fallbackData.map((installation) => installation.installation_id);
  }

  throw error;
}

export async function isRepositoryInCurrentWorkspace(
  repositoryId: string,
  context: CurrentWorkspaceContext,
) {
  const installationIds = await listCurrentWorkspaceInstallationIds(context);

  if (installationIds.length === 0) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installed_repositories")
    .select("id")
    .eq("id", repositoryId)
    .in("installation_id", installationIds)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function listCurrentWorkspaceRepositoryIds(
  context: CurrentWorkspaceContext,
) {
  const installationIds = await listCurrentWorkspaceInstallationIds(context);

  if (installationIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installed_repositories")
    .select("id")
    .in("installation_id", installationIds)
    .returns<RepositoryRow[]>();

  if (error) {
    throw error;
  }

  return data.map((repository) => repository.id);
}

async function ensurePersonalWorkspace(user: CurrentUser) {
  const supabase = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<WorkspaceMembershipRow>();

  if (membershipError) {
    if (isMissingWorkspaceTableError(membershipError)) {
      return null;
    }

    throw membershipError;
  }

  if (membership) {
    return membership.workspace_id;
  }

  const { data: existingWorkspace, error: existingWorkspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("personal_owner_user_id", user.id)
    .maybeSingle<WorkspaceRow>();

  if (existingWorkspaceError) {
    if (isMissingWorkspaceTableError(existingWorkspaceError)) {
      return null;
    }

    throw existingWorkspaceError;
  }

  const workspaceId =
    existingWorkspace?.id || (await createPersonalWorkspace(user));

  const { error: membershipCreateError } = await supabase
    .from("workspace_memberships")
    .upsert(
      {
        role: "owner",
        user_id: user.id,
        workspace_id: workspaceId,
      },
      { onConflict: "workspace_id,user_id" },
    );

  if (membershipCreateError && !isMissingWorkspaceTableError(membershipCreateError)) {
    throw membershipCreateError;
  }

  return workspaceId;
}

async function createPersonalWorkspace(user: CurrentUser) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      name: getPersonalWorkspaceName(user),
      personal_owner_user_id: user.id,
    })
    .select("id")
    .single<WorkspaceRow>();

  if (error) {
    throw error;
  }

  return data.id;
}

async function adoptUnownedInstallations(context: CurrentWorkspaceContext) {
  const supabase = createSupabaseAdminClient();
  const ownerUpdateFields: {
    updated_at: string;
    user_id: string;
    workspace_id?: string | null;
  } = {
    updated_at: new Date().toISOString(),
    user_id: context.user.id,
  };

  if (context.workspaceId) {
    ownerUpdateFields.workspace_id = context.workspaceId;
  }

  const { error } = await supabase
    .from("github_app_installations")
    .update(ownerUpdateFields)
    .is("user_id", null)
    .eq("status", "active");

  if (error && context.workspaceId && isMissingWorkspaceColumnError(error)) {
    const { error: fallbackError } = await supabase
      .from("github_app_installations")
      .update({
        updated_at: new Date().toISOString(),
        user_id: context.user.id,
      })
      .is("user_id", null)
      .eq("status", "active");

    if (fallbackError) {
      throw fallbackError;
    }

    return;
  }

  if (error) {
    throw error;
  }

  if (!context.workspaceId) {
    return;
  }

  const { error: workspaceUpdateError } = await supabase
    .from("github_app_installations")
    .update({
      updated_at: new Date().toISOString(),
      workspace_id: context.workspaceId,
    })
    .eq("user_id", context.user.id)
    .is("workspace_id", null)
    .eq("status", "active");

  if (workspaceUpdateError && !isMissingWorkspaceColumnError(workspaceUpdateError)) {
    throw workspaceUpdateError;
  }
}

function getPersonalWorkspaceName(user: CurrentUser) {
  if (!user.email) {
    return "Personal workspace";
  }

  const [name] = user.email.split("@");
  return `${name.replace(/[._-]+/g, " ")} workspace`;
}

function isMissingWorkspaceTableError(error: SupabaseError) {
  return (
    error.code === "42P01" ||
    error.message?.includes("workspaces") ||
    error.message?.includes("workspace_memberships") ||
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
