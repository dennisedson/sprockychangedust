// @workflow_state: REVIEW
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const nullableText = (maxLength: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }, z.string().max(maxLength).nullable());

const nullableUrl = z.preprocess((value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
}, z.string().max(240).url().nullable());

export const userProfileInputSchema = z.object({
  firstName: nullableText(80),
  lastName: nullableText(80),
  title: nullableText(120),
  company: nullableText(120),
  location: nullableText(120),
  githubUrl: nullableUrl,
  bio: nullableText(600),
});

export type UserProfileInput = z.infer<typeof userProfileInputSchema>;

export type UserProfile = UserProfileInput & {
  displayName: string;
  email: string | null;
  initials: string;
  isAuthenticated: boolean;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  github_url: string | null;
  bio: string | null;
};

const emptyProfile: UserProfileInput = {
  firstName: null,
  lastName: null,
  title: null,
  company: null,
  location: null,
  githubUrl: null,
  bio: null,
};

export async function getCurrentUserProfile(): Promise<UserProfile> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return buildUserProfile(emptyProfile, null, false);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("first_name,last_name,title,company,location,github_url,bio")
    .eq("user_id", user.id)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }

  return buildUserProfile(
    {
      firstName: data?.first_name || null,
      lastName: data?.last_name || null,
      title: data?.title || null,
      company: data?.company || null,
      location: data?.location || null,
      githubUrl: data?.github_url || null,
      bio: data?.bio || null,
    },
    user.email || null,
    true,
  );
}

export async function saveCurrentUserProfile(profile: UserProfileInput) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const parsedProfile = userProfileInputSchema.parse(profile);
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      first_name: parsedProfile.firstName,
      last_name: parsedProfile.lastName,
      title: parsedProfile.title,
      company: parsedProfile.company,
      location: parsedProfile.location,
      github_url: parsedProfile.githubUrl,
      bio: parsedProfile.bio,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

function buildUserProfile(
  profile: UserProfileInput,
  email: string | null,
  isAuthenticated: boolean,
): UserProfile {
  const displayName = getDisplayName(profile, email);

  return {
    ...profile,
    displayName,
    email,
    initials: getInitials(displayName, email),
    isAuthenticated,
  };
}

function getDisplayName(profile: UserProfileInput, email: string | null) {
  const profileName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  if (profileName) {
    return profileName;
  }

  if (email) {
    return titleCase(email.split("@")[0].replace(/[._-]+/g, " "));
  }

  return "Sprocky User";
}

function getInitials(displayName: string, email: string | null) {
  const source = displayName !== "Sprocky User" ? displayName : email || displayName;
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "SC";
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`)
    .join(" ");
}
