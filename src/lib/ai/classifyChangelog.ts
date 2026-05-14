import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openaiClient";

export const changelogClassificationSchema = z.object({
  classification: z.enum(["breaking", "enhancement", "informational"]),
  severity: z.enum(["red", "amber", "green"]),
  summary: z.string().min(1),
  migrationSteps: z.array(z.string()).default([]),
  impactedKeywords: z.array(z.string()).default([]),
});

export type ChangelogClassification = z.infer<typeof changelogClassificationSchema>;

const openAiChangelogClassificationSchema = z.object({
  classification: z.enum(["breaking", "enhancement", "informational"]),
  severity: z.enum(["red", "amber", "green"]),
  summary: z.string().min(1),
  migrationSteps: z.array(z.string()),
  impactedKeywords: z.array(z.string()),
});

export async function classifyChangelogEntry(input: {
  title: string;
  content: string;
  link: string;
}): Promise<ChangelogClassification> {
  const openai = getOpenAIClient();

  if (!openai) {
    return heuristicClassification(input);
  }

  try {
    const response = await openai.responses.parse({
      model: getOpenAIModel(),
      instructions:
        "Classify HubSpot developer changelog entries for app developers. Return focused JSON with classification, severity, summary, migrationSteps, and impactedKeywords. The summary must be one useful 18-35 word sentence that explains what changed and why developers may care; do not repeat or lightly rephrase the title. Keep impactedKeywords specific to product areas, APIs, endpoints, auth flows, SDKs, or CMS features named in the changelog.",
      input: JSON.stringify(input),
      text: {
        format: zodTextFormat(
          openAiChangelogClassificationSchema,
          "changelog_classification",
        ),
      },
      max_output_tokens: 900,
      store: false,
      user: "sprocky-changedust",
    });

    if (!response.output_parsed) {
      return heuristicClassification(input);
    }

    return normalizeClassification(input, response.output_parsed);
  } catch (error) {
    console.error(error);
    return heuristicClassification(input);
  }
}

function heuristicClassification(input: {
  title: string;
  content: string;
  link: string;
}): ChangelogClassification {
  const text = `${input.title} ${input.content}`.toLowerCase();
  const isBreaking = /breaking|sunset|deprecat|removed|migration|required/.test(text);
  const isWarning = /beta|limit|oauth|scope|endpoint|api/.test(text);

  return {
    classification: isBreaking
      ? "breaking"
      : isWarning
        ? "enhancement"
        : "informational",
    severity: isBreaking ? "red" : isWarning ? "amber" : "green",
    summary: createFallbackSummary(input),
    migrationSteps: isBreaking ? ["Review the changelog and confirm affected API usage."] : [],
    impactedKeywords: extractKeywords(text),
  };
}

function normalizeClassification(
  input: {
    title: string;
    content: string;
    link: string;
  },
  classification: ChangelogClassification,
) {
  const summary = isTitleRepeat(input.title, classification.summary)
    ? createFallbackSummary(input)
    : classification.summary;

  return changelogClassificationSchema.parse({
    ...classification,
    summary,
  });
}

function createFallbackSummary(input: { title: string; content: string }) {
  const cleanContent = input.content
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

  if (!cleanContent || isTitleRepeat(input.title, cleanContent)) {
    return `Review this HubSpot changelog entry for developer impact related to ${input.title}.`;
  }

  const sentenceMatch = cleanContent.match(/^.{80,220}?[.!?](?:\s|$)/);
  const summary = sentenceMatch?.[0] || cleanContent.slice(0, 220);

  return summary.trim();
}

function isTitleRepeat(title: string, summary: string) {
  return normalizeText(title) === normalizeText(summary);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractKeywords(text: string) {
  return Array.from(
    new Set(
      [
        "contacts",
        "crm",
        "oauth",
        "cms",
        "forms",
        "webhooks",
        "timeline",
        "tickets",
        "owners",
        "associations",
      ].filter((keyword) => text.includes(keyword)),
    ),
  );
}
