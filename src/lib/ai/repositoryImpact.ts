// @workflow_state: REVIEW
import crypto from "node:crypto";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openaiClient";
import type { ScanSignal } from "@/lib/scanner/types";

const maxSignalsForAi = 30;

export const repositoryImpactAssessmentSchema = z.object({
  hasRelevantUsage: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  relevantSignalIndexes: z.array(z.number().int().min(0)),
});

export type RepositoryImpactAssessmentOutput = z.infer<
  typeof repositoryImpactAssessmentSchema
>;

export type RepositoryImpactAssessment = {
  hasRelevantUsage: boolean;
  relevantSignals: ScanSignal[];
  confidence: number;
  reason: string;
  analysisMethod: "openai" | "heuristic" | "scanner" | "batch";
};

export type RepositoryImpactInput = {
  repositoryName: string;
  changelog: {
    id: string;
    title: string;
    summary: string;
    severity: "red" | "amber" | "green";
    migrationSteps: string[];
    impactedKeywords: string[];
  };
  signals: ScanSignal[];
};

export const repositoryImpactInstructions = [
  "You decide whether a connected GitHub repository is actually impacted by one HubSpot developer changelog.",
  "HubSpot usage alone is not enough. The repository evidence must match the changelog's specific API, product area, auth flow, endpoint family, SDK, CMS feature, webhook behavior, or migration subject.",
  "For example, CMS, HubL, HubDB, or source-code API evidence does not match an OAuth, token, or scope changelog unless that evidence itself mentions OAuth, tokens, authorization, or scopes.",
  "Return hasRelevantUsage true only when at least one provided signal directly supports the match. Select only the indexes of the supporting signals.",
].join("\n");

export async function assessRepositoryImpact(
  input: RepositoryImpactInput,
): Promise<RepositoryImpactAssessment> {
  if (input.signals.length === 0) {
    return {
      hasRelevantUsage: false,
      relevantSignals: [],
      confidence: 1,
      reason: "No HubSpot usage signals were detected in the repository.",
      analysisMethod: "scanner",
    };
  }

  const openai = getOpenAIClient();

  if (!openai) {
    return heuristicRepositoryImpact(input);
  }

  try {
    const response = await openai.responses.parse({
      ...createRepositoryImpactResponseBody(input, getOpenAIModel()),
      metadata: {
        task: "repository_impact",
        changelog_entry_id: input.changelog.id,
      },
    });

    if (!response.output_parsed) {
      return heuristicRepositoryImpact(input);
    }

    return normalizeRepositoryImpactAssessment(
      response.output_parsed,
      input.signals,
      "openai",
    );
  } catch (error) {
    console.error(error);
    return heuristicRepositoryImpact(input);
  }
}

export function createRepositoryImpactResponseBody(
  input: RepositoryImpactInput,
  model: string,
) {
  return {
    model,
    instructions: repositoryImpactInstructions,
    input: JSON.stringify(toRepositoryImpactPromptPayload(input)),
    text: {
      format: zodTextFormat(
        repositoryImpactAssessmentSchema,
        "repository_impact_assessment",
      ),
    },
    max_output_tokens: 700,
    store: false,
    user: "sprocky-changedust",
  };
}

export function parseRepositoryImpactResponseText(
  text: string,
  signals: ScanSignal[],
  analysisMethod: RepositoryImpactAssessment["analysisMethod"],
) {
  return normalizeRepositoryImpactAssessment(
    repositoryImpactAssessmentSchema.parse(JSON.parse(text)),
    signals,
    analysisMethod,
  );
}

export function createRepositoryImpactCacheKey(input: RepositoryImpactInput) {
  const hashInput = {
    changelog: input.changelog,
    signals: input.signals.map((signal) => ({
      filePath: signal.filePath,
      kind: signal.kind,
      label: signal.label,
      line: signal.line,
      excerpt: signal.excerpt,
    })),
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex");
}

export function normalizeRepositoryImpactAssessment(
  output: RepositoryImpactAssessmentOutput,
  signals: ScanSignal[],
  analysisMethod: RepositoryImpactAssessment["analysisMethod"],
): RepositoryImpactAssessment {
  const relevantSignals = output.relevantSignalIndexes
    .map((index) => signals[index])
    .filter((signal): signal is ScanSignal => Boolean(signal));
  const hasRelevantUsage = output.hasRelevantUsage && relevantSignals.length > 0;

  return {
    hasRelevantUsage,
    relevantSignals: hasRelevantUsage ? relevantSignals : [],
    confidence: output.confidence,
    reason: output.reason,
    analysisMethod,
  };
}

function heuristicRepositoryImpact(input: RepositoryImpactInput): RepositoryImpactAssessment {
  const changelogText = [
    input.changelog.title,
    input.changelog.summary,
    ...input.changelog.migrationSteps,
    ...input.changelog.impactedKeywords,
  ]
    .join(" ")
    .toLowerCase();
  const relevantSignals = input.signals.filter((signal) =>
    isSignalRelevantToChangelog(signal, changelogText, input.changelog.impactedKeywords),
  );

  return {
    hasRelevantUsage: relevantSignals.length > 0,
    relevantSignals,
    confidence: relevantSignals.length > 0 ? 0.62 : 0.72,
    reason:
      relevantSignals.length > 0
        ? "Heuristic keyword and signal-kind overlap found relevant HubSpot usage."
        : "Heuristic matching found HubSpot usage, but not usage related to this changelog subject.",
    analysisMethod: "heuristic",
  };
}

function toRepositoryImpactPromptPayload(input: RepositoryImpactInput) {
  return {
    repositoryName: input.repositoryName,
    changelog: input.changelog,
    signals: input.signals.slice(0, maxSignalsForAi).map((signal, index) => ({
      index,
      filePath: signal.filePath,
      kind: signal.kind,
      label: signal.label,
      severity: signal.severity,
      line: signal.line,
      excerpt: signal.excerpt,
    })),
  };
}

function isSignalRelevantToChangelog(
  signal: ScanSignal,
  changelogText: string,
  impactedKeywords: string[],
) {
  const signalText = [signal.kind, signal.label, signal.filePath, signal.excerpt]
    .join(" ")
    .toLowerCase();
  const domains = [
    {
      changelog: /\boauth\b|authorization|auth flow|access token|refresh token|scope/i,
      signal: /\boauth\b|authorization|access token|refresh token|scope|\/oauth\//i,
      kinds: ["auth"],
      allowKindOnly: true,
    },
    {
      changelog: /\bcms\b|hubl|hubdb|theme|module|page|blog|source[-\s]?code/i,
      signal: /\bcms\b|hubl|hubdb|theme|module|page|blog|source[-\s]?code/i,
      kinds: ["cms", "serverless"],
      allowKindOnly: true,
    },
    {
      changelog: /webhook|subscription/i,
      signal: /webhook|subscription|x-hubspot-signature/i,
      kinds: ["webhook"],
      allowKindOnly: true,
    },
    {
      changelog: /crm|contacts?|companies|deals|tickets|owners|associations|objects|properties/i,
      signal: /crm|contacts?|companies|deals|tickets|owners|associations|objects|properties/i,
      kinds: ["api"],
      allowKindOnly: false,
    },
    {
      changelog: /forms?/i,
      signal: /forms?/i,
      kinds: ["api", "source-pattern"],
      allowKindOnly: false,
    },
  ];
  const matchingDomains = domains.filter((domain) => domain.changelog.test(changelogText));

  if (matchingDomains.length > 0) {
    return matchingDomains.some(
      (domain) =>
        domain.signal.test(signalText) ||
        (domain.allowKindOnly && domain.kinds.includes(signal.kind)),
    );
  }

  const keywords = impactedKeywords
    .map((keyword) => keyword.toLowerCase().trim())
    .filter((keyword) => keyword.length >= 3 && keyword !== "hubspot");

  if (keywords.length > 0) {
    return keywords.some((keyword) => signalText.includes(keyword));
  }

  return /\bapi\b|endpoint|deprecat|migration|sdk/i.test(changelogText)
    ? signal.kind === "api" || signal.kind === "dependency" || signal.kind === "source-pattern"
    : false;
}
