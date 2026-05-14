import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/lib/env";

export const changelogClassificationSchema = z.object({
  classification: z.enum(["breaking", "enhancement", "informational"]),
  severity: z.enum(["red", "amber", "green"]),
  summary: z.string().min(1),
  migrationSteps: z.array(z.string()).default([]),
  impactedKeywords: z.array(z.string()).default([]),
});

export type ChangelogClassification = z.infer<typeof changelogClassificationSchema>;

export async function classifyChangelogEntry(input: {
  title: string;
  content: string;
  link: string;
}): Promise<ChangelogClassification> {
  if (!env.OPENAI_API_KEY) {
    return heuristicClassification(input);
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Classify HubSpot developer changelog entries for app developers. Return JSON with classification, severity, summary, migrationSteps, and impactedKeywords.",
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message.content;

  if (!content) {
    return heuristicClassification(input);
  }

  return changelogClassificationSchema.parse(JSON.parse(content));
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
