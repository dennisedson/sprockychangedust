import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";

export function verifyGitHubWebhookSignature(payload: string, signatureHeader: string | null) {
  if (!signatureHeader) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", requireEnv("GITHUB_WEBHOOK_SECRET"))
    .update(payload)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

type GitHubRepositoryPayload = {
  id: number;
  full_name: string;
  private: boolean;
};

type InstallationPayload = {
  action: string;
  installation: {
    id: number;
    account?: {
      login?: string;
    };
  };
  repositories?: GitHubRepositoryPayload[];
};

export async function handleGitHubInstallationWebhook(payload: InstallationPayload) {
  const supabase = createSupabaseAdminClient();
  const accountLogin = payload.installation.account?.login || "unknown";

  await supabase.from("github_app_installations").upsert(
    {
      installation_id: payload.installation.id,
      github_account_login: accountLogin,
      status: payload.action === "deleted" ? "deleted" : "active",
    },
    { onConflict: "installation_id" },
  );

  if (!payload.repositories?.length) {
    return;
  }

  await supabase.from("installed_repositories").upsert(
    payload.repositories.map((repository) => ({
      installation_id: payload.installation.id,
      github_repo_id: repository.id,
      repo_name: repository.full_name,
      repo_private: repository.private,
      is_active_for_scanning: payload.action !== "deleted",
    })),
    { onConflict: "github_repo_id" },
  );
}
