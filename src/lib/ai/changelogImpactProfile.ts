// @workflow_state: REVIEW
import crypto from "node:crypto";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openaiClient";
import type { RepositoryManifest } from "@/lib/scanner/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const changelogImpactProfileSchema = z.object({
  targetVersions: z.array(z.string()),
  affectedVersions: z.array(z.string()),
  apiPatterns: z.array(z.string()),
  fileMarkers: z.array(z.string()),
  functionCalls: z.array(z.string()),
  scopeChanges: z.array(z.string()),
  productAreas: z.array(z.string()),
  searchTerms: z.array(z.string()),
  reason: z.string(),
});

export type ChangelogImpactProfile = z.infer<typeof changelogImpactProfileSchema>;
type ChangelogImpactProfileResult = {
  profile: ChangelogImpactProfile;
  analysisMethod: "openai" | "heuristic";
};

export type ChangelogImpactProfileInput = {
  id: string;
  title: string;
  summary: string;
  rawContent: string;
  migrationSteps: string[];
  impactedKeywords: string[];
};

export type RepositoryManifestRow = {
  installed_repository_id: string;
  platform_versions: string[];
  api_paths: string[];
  api_version_segments: string[];
  sdk_packages: string[];
  sdk_symbols: string[];
  scopes: string[];
  file_markers: string[];
  product_areas: string[];
  evidence: RepositoryManifest["evidence"];
};

type ChangelogImpactProfileRow = {
  profile_cache_key: string;
  profile: ChangelogImpactProfile;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

const changelogImpactProfileInstructions = [
  "Create a Global Impact Profile for one HubSpot developer changelog.",
  "The profile must describe code signatures that can be matched against repository metadata before any deep AI verification.",
  "Prefer literal, specific signatures: API path fragments, version segments, file names, config markers, SDK method chains, scopes, and product areas.",
  "Do not include generic terms like HubSpot, update, change, or developer unless they identify a specific product area or code marker.",
].join("\n");

export async function getOrCreateChangelogImpactProfile(
  input: ChangelogImpactProfileInput,
) {
  const cacheKey = createChangelogImpactProfileCacheKey(input);
  const cached = await getCachedChangelogImpactProfile(input.id, cacheKey);

  if (cached) {
    return cached;
  }

  const result = await createChangelogImpactProfile(input);

  await saveChangelogImpactProfile({
    changelogEntryId: input.id,
    cacheKey,
    profile: result.profile,
    analysisMethod: result.analysisMethod,
  });

  return result.profile;
}

export function doesRepositoryManifestMatchProfile(
  profile: ChangelogImpactProfile,
  manifest: RepositoryManifest,
) {
  const hasSpecificProfileSignature = [
    profile.productAreas,
    profile.affectedVersions,
    profile.apiPatterns,
    profile.fileMarkers,
    profile.functionCalls,
    profile.scopeChanges,
    profile.searchTerms,
  ].some((values) => values.length > 0);

  if (!hasSpecificProfileSignature) {
    return manifest.productAreas.length > 0;
  }

  const manifestText = [
    ...manifest.apiPaths,
    ...manifest.apiVersionSegments,
    ...manifest.sdkPackages,
    ...manifest.sdkSymbols,
    ...manifest.scopes,
    ...manifest.fileMarkers,
    ...manifest.productAreas,
    ...manifest.platformVersions,
    ...manifest.evidence.map((item) => item.value),
  ]
    .join(" ")
    .toLowerCase();
  const productAreaMatch = intersects(profile.productAreas, manifest.productAreas);
  const preciseMatches = [
    containsAny(manifest.apiPaths, profile.apiPatterns),
    containsAny(manifest.apiVersionSegments, profile.affectedVersions),
    containsAny(manifest.platformVersions, profile.affectedVersions),
    containsAny(manifest.fileMarkers, profile.fileMarkers),
    containsAny(manifest.sdkSymbols, profile.functionCalls),
    containsAny(manifest.scopes, profile.scopeChanges),
  ];

  if (preciseMatches.some(Boolean)) {
    return true;
  }

  if (!productAreaMatch) {
    return false;
  }

  return profile.searchTerms.some((term) => manifestText.includes(term.toLowerCase()));
}

export function mapRepositoryManifestRow(row: RepositoryManifestRow): RepositoryManifest {
  return {
    platformVersions: row.platform_versions || [],
    apiPaths: row.api_paths || [],
    apiVersionSegments: row.api_version_segments || [],
    sdkPackages: row.sdk_packages || [],
    sdkSymbols: row.sdk_symbols || [],
    scopes: row.scopes || [],
    fileMarkers: row.file_markers || [],
    productAreas: row.product_areas || [],
    evidence: row.evidence || [],
  };
}

async function createChangelogImpactProfile(
  input: ChangelogImpactProfileInput,
): Promise<ChangelogImpactProfileResult> {
  const openai = getOpenAIClient();

  if (!openai) {
    return {
      profile: heuristicChangelogImpactProfile(input),
      analysisMethod: "heuristic",
    };
  }

  try {
    const response = await openai.responses.parse({
      model: getOpenAIModel(),
      instructions: changelogImpactProfileInstructions,
      input: JSON.stringify(input),
      text: {
        format: zodTextFormat(changelogImpactProfileSchema, "changelog_impact_profile"),
      },
      max_output_tokens: 1600,
      store: false,
      user: "sprocky-changedust",
      metadata: {
        task: "changelog_impact_profile",
        changelog_entry_id: input.id,
      },
    });

    if (!response.output_parsed) {
      return {
        profile: heuristicChangelogImpactProfile(input),
        analysisMethod: "heuristic",
      };
    }

    return {
      profile: normalizeChangelogImpactProfile(response.output_parsed),
      analysisMethod: "openai",
    };
  } catch (error) {
    console.error(error);
    return {
      profile: heuristicChangelogImpactProfile(input),
      analysisMethod: "heuristic",
    };
  }
}

function heuristicChangelogImpactProfile(
  input: ChangelogImpactProfileInput,
): ChangelogImpactProfile {
  const text = [
    input.title,
    input.summary,
    input.rawContent,
    ...input.migrationSteps,
    ...input.impactedKeywords,
  ]
    .join(" ")
    .toLowerCase();
  const productAreas = extractProductAreas(text);
  const targetVersions = uniqueMatches(text, /\b\d{4}[-.]\d{2}\b/g);
  const affectedVersions = uniqueMatches(text, /\bv\d+\b|\b\d{4}[-.]\d{2}(?:-beta)?\b/g);
  const apiPatterns = uniqueMatches(
    text,
    /\/(?:crm|cms|oauth|automation|marketing|forms|files|events|webhooks|conversations|communication-preferences)\/(?:v\d+|\d{4}-\d{2}(?:-beta)?)(?:\/[a-z0-9_./{}-]+)?/g,
  );

  return normalizeChangelogImpactProfile({
    targetVersions,
    affectedVersions,
    apiPatterns,
    fileMarkers: extractFileMarkers(text),
    functionCalls: extractFunctionCalls(text),
    scopeChanges: extractScopes(text),
    productAreas,
    searchTerms: [
      ...productAreas,
      ...input.impactedKeywords,
      ...extractSearchTerms(text),
    ],
    reason: "Generated from changelog keywords and known HubSpot code signatures.",
  });
}

async function getCachedChangelogImpactProfile(
  changelogEntryId: string,
  cacheKey: string,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("changelog_impact_profiles")
    .select("profile_cache_key,profile")
    .eq("changelog_entry_id", changelogEntryId)
    .maybeSingle<ChangelogImpactProfileRow>();

  if (error || !data || data.profile_cache_key !== cacheKey) {
    return undefined;
  }

  return changelogImpactProfileSchema.parse(data.profile);
}

async function saveChangelogImpactProfile(input: {
  changelogEntryId: string;
  cacheKey: string;
  profile: ChangelogImpactProfile;
  analysisMethod: "openai" | "heuristic";
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("changelog_impact_profiles").upsert(
    {
      changelog_entry_id: input.changelogEntryId,
      profile_cache_key: input.cacheKey,
      analysis_method: input.analysisMethod,
      target_versions: input.profile.targetVersions,
      affected_versions: input.profile.affectedVersions,
      api_patterns: input.profile.apiPatterns,
      file_markers: input.profile.fileMarkers,
      function_calls: input.profile.functionCalls,
      scope_changes: input.profile.scopeChanges,
      product_areas: input.profile.productAreas,
      search_terms: input.profile.searchTerms,
      profile: input.profile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "changelog_entry_id" },
  );

  if (error && !isMissingChangelogImpactProfileTableError(error)) {
    throw error;
  }
}

function normalizeChangelogImpactProfile(
  profile: ChangelogImpactProfile,
): ChangelogImpactProfile {
  return {
    targetVersions: uniqueNormalized(profile.targetVersions),
    affectedVersions: uniqueNormalized(profile.affectedVersions),
    apiPatterns: uniqueNormalized(profile.apiPatterns),
    fileMarkers: uniqueNormalized(profile.fileMarkers),
    functionCalls: uniqueNormalized(profile.functionCalls),
    scopeChanges: uniqueNormalized(profile.scopeChanges),
    productAreas: uniqueNormalized(profile.productAreas),
    searchTerms: uniqueNormalized(profile.searchTerms).filter((term) => term !== "hubspot"),
    reason: profile.reason,
  };
}

function createChangelogImpactProfileCacheKey(input: ChangelogImpactProfileInput) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function intersects(left: string[], right: string[]) {
  const rightValues = new Set(right.map((value) => value.toLowerCase()));

  return left.some((value) => rightValues.has(value.toLowerCase()));
}

function containsAny(values: string[], candidates: string[]) {
  const normalizedValues = values.map((value) => value.toLowerCase());

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeVersion(candidate.toLowerCase());

    return normalizedValues.some((value) =>
      normalizeVersion(value).includes(normalizedCandidate),
    );
  });
}

function extractProductAreas(text: string) {
  const productAreas = [
    ["crm", /\bcrm\b|contacts?|companies|deals|tickets|owners|associations|objects|properties/],
    ["cms", /\bcms\b|hubl|hubdb|blog|page|theme|module|source-code/],
    ["oauth", /\boauth\b|authorization|access token|refresh token|scope/],
    ["webhooks", /webhook|subscription/],
    ["forms", /\bforms?\b/],
    ["serverless", /serverless|functions?/],
    ["developer-platform", /platformversion|developer platform|project/],
  ] as const;

  return productAreas
    .filter(([, pattern]) => pattern.test(text))
    .map(([area]) => area);
}

function extractFileMarkers(text: string) {
  return [
    "hsproject.json",
    "serverless.json",
    "app-hsmeta.json",
    "-hsmeta.json",
    "hubspot.config.yml",
    "hubspot.config.yaml",
  ].filter((marker) => text.includes(marker.toLowerCase()));
}

function extractFunctionCalls(text: string) {
  return uniqueMatches(
    text,
    /\b(?:hubspotclient|hubspot)\.(?:crm|cms|oauth|automation|marketing|files|settings|webhooks)(?:\.[a-z0-9_]+){0,5}/g,
  );
}

function extractScopes(text: string) {
  return uniqueMatches(
    text,
    /\b(?:crm|cms|oauth|settings|timeline|automation|forms|files|tickets|contacts|companies|deals)\.[a-z0-9_.:-]+(?:\.[a-z]+)?\b/g,
  );
}

function extractSearchTerms(text: string) {
  return [
    "access token",
    "refresh token",
    "authorization",
    "scope",
    "contacts",
    "associations",
    "source-code",
    "serverless",
    "hubdb",
    "hubl",
    "webhook",
    "forms",
  ].filter((term) => text.includes(term));
}

function uniqueMatches(text: string, pattern: RegExp) {
  return Array.from(new Set(Array.from(text.matchAll(pattern)).map((match) => match[0])));
}

function uniqueNormalized(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeVersion(value: string) {
  return value.replace(".", "-");
}

function isMissingChangelogImpactProfileTableError(error: SupabaseError) {
  return (
    error.code === "42P01" ||
    error.message?.includes("changelog_impact_profiles") ||
    false
  );
}
