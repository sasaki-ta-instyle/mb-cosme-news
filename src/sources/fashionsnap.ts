import Parser from "rss-parser";
import type { RawArticle } from "../types.ts";
import { USER_AGENT, FETCH_TIMEOUT_MS } from "../../config/sources.ts";

const FEED_URL = "https://www.fashionsnap.com/rss.xml";

// FASHIONSNAP の RSS は全カテゴリ混在。Beauty カテゴリだけ拾うため URL/カテゴリで絞る。
const BEAUTY_PATH_HINTS = ["/beauty/", "/article/"];
const BEAUTY_CATEGORY_HINTS = ["ビューティ", "ビューティー", "ビューテイ", "美容", "コスメ", "化粧"];

export async function fetchFashionsnap(): Promise<RawArticle[]> {
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

    const cats = (item.categories ?? []).join(" ");
    const urlMatches = BEAUTY_PATH_HINTS.some((h) => url.includes(h));
    const catMatches = BEAUTY_CATEGORY_HINTS.some((h) => cats.includes(h));
    // RSS は混在なのでパスが /beauty/ を含むか、カテゴリにビューティ系語が入ってるかで絞る
    // /article/ の場合は description/title 側のキーワードフィルタで落とす（一段目を広めに通す）
    if (!urlMatches && !catMatches) continue;

    let publishedAt: Date | null = null;
    if (item.isoDate) {
      const d = new Date(item.isoDate);
      if (!isNaN(d.getTime())) publishedAt = d;
    } else if (item.pubDate) {
      const d = new Date(item.pubDate);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    articles.push({
      source: "fashionsnap",
      sourceName: "FASHIONSNAP",
      title,
      description: (item.contentSnippet ?? item.content ?? "").slice(0, 500),
      url,
      publishedAt,
    });
  }
  return articles;
}
