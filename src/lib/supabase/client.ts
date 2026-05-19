// @workflow_state: REVIEW
import { createBrowserClient } from "@supabase/ssr";

export function createClientSupabaseClient() {
  const supabaseUrl = normalizeBrowserEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalizeBrowserEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase browser configuration. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.",
    );
  }

  validateSupabaseUrl(supabaseUrl);
  validateSupabaseAnonKey(supabaseAnonKey);

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
  );
}

function normalizeBrowserEnvValue(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
}

function validateSupabaseUrl(value: string) {
  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Re-copy the Supabase project URL and redeploy.",
    );
  }
}

function validateSupabaseAnonKey(value: string) {
  try {
    const headers = new Headers();
    headers.set("apikey", value);
    headers.set("Authorization", `Bearer ${value}`);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY has invalid characters. Re-copy the anon/public key without spaces or line breaks, then redeploy.",
    );
  }

  if (getJwtRole(value) === "service_role") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is using a service role key. Replace it with the anon/public key and rotate the exposed service role key.",
    );
  }
}

function getJwtRole(value: string) {
  const [, payload] = value.split(".");

  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload =
      normalizedPayload + "=".repeat((4 - (normalizedPayload.length % 4)) % 4);
    const parsed = JSON.parse(atob(paddedPayload)) as { role?: string };

    return parsed.role || null;
  } catch {
    return null;
  }
}
