import { z } from "zod";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z.string().default("Sprocky Changedust"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  GITHUB_APP_ID: optionalString,
  GITHUB_APP_CLIENT_ID: optionalString,
  GITHUB_APP_CLIENT_SECRET: optionalString,
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_WEBHOOK_SECRET: optionalString,
  GITHUB_APP_INSTALL_URL: optionalUrl,
  CRON_SECRET: optionalString,
  HUBSPOT_CHANGELOG_FEED_URL: z
    .string()
    .url()
    .default("https://developers.hubspot.com/changelog/rss.xml"),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  OPENAI_BATCH_MODEL: optionalString,
  RESEND_API_KEY: optionalString,
  ALERT_FROM_EMAIL: z.string().default("Sprocky Changedust <alerts@example.com>"),
  GITHUB_ISSUE_LABEL: z.string().default("hubspot-changelog"),
});

export const env = envSchema.parse(process.env);

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
