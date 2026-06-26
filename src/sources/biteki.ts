import Parser from "rss-parser";
import type { RawArticle } from "../types.ts";
import { USER_AGENT, FETCH_TIMEOUT_MS } from "../../config/sources.ts";

const FEED_URL = "https://www.biteki.com/feed";

export async function fetchBiteki(): Promise<RawArticle[]> {
  const parser = new Parser({
    timeout: FETCH_TIMEOUT_MS,
    headers: { "user-agent": USER_AGENT },
  });
  const feed = await parser.parseURL(FEED_URL);
  const articles: RawArticle[] = [];
  for (const item of feed.items ?? []) {
    const url = item.link ?? "";
    const title = (item.title ?? "").trim();
    if (!url || !title) continue;

    let publishedAt: Date | null = null;
    if (item.isoDate) {
      const d = new Date(item.isoDate);
      if (!isNaN(d.getTime())) publishedAt = d;
    } else if (item.pubDate) {
      const d = new Date(item.pubDate);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    articles.push({
      source: "biteki",
      sourceName: "美的",
      title,
      description: (item.contentSnippet ?? item.content ?? "").slice(0, 500),
      url,
      publishedAt,
    });
  }
  return articles;
}
