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
        "Classify HubSpot developer changelog entries for app developers. Return focused JSON with classification, severity, summary, migrationSteps, and impactedKeywords. Keep impactedKeywords specific to product areas, APIs, endpoints, auth flows, SDKs, or CMS features named in the changelog.",
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

    return changelogClassificationSchema.parse(response.output_parsed);
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
    summary: input.title,
    migrationSteps: isBreaking ? ["Review the changelog and confirm affected API usage."] : [],
    impactedKeywords: extractKeywords(text),
  };
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
