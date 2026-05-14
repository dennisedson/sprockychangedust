import Parser from "rss-parser";
import { env } from "@/lib/env";

export type ChangelogFeedEntry = {
  guid: string;
  title: string;
  link: string;
  publicationDate: string;
  rawContent: string;
};

const parser = new Parser();

export async function fetchHubSpotChangelogFeed(): Promise<ChangelogFeedEntry[]> {
  const feed = await parser.parseURL(env.HUBSPOT_CHANGELOG_FEED_URL);

  return feed.items
    .filter((item) => item.guid || item.link)
    .map((item) => ({
      guid: item.guid || item.link || item.title || crypto.randomUUID(),
      title: item.title || "Untitled changelog entry",
      link: item.link || env.HUBSPOT_CHANGELOG_FEED_URL,
      publicationDate: item.isoDate || item.pubDate || new Date().toISOString(),
      rawContent: item.contentSnippet || item.content || "",
    }));
}
