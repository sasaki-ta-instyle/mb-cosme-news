import * as cheerio from "cheerio";
import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";

const PAGE_URL = "https://www.wwdjapan.com/category/beauty";
const BASE = "https://www.wwdjapan.com";

export async function fetchWwd(): Promise<RawArticle[]> {
  const html = await fetchText(PAGE_URL);
  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];
  const seen = new Set<string>();

  // 記事カードの構造は変わるので、article 内の最初のリンク + テキストを採る方針
  $("article").each((_, el) => {
    const $el = $(el);
    const $a = $el.find("a[href*='/articles/']").first();
    const href = $a.attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : new URL(href, BASE).toString();
    if (seen.has(url)) return;
    seen.add(url);

    const title =
      $el.find("h2,h3").first().text().trim() ||
      $a.attr("title") ||
      $a.text().trim();
    if (!title || title.length < 4) return;

    const description = $el.find("p").first().text().trim();

    // 公開日時の取得は不安定なので null 許容
    let publishedAt: Date | null = null;
    const timeStr = $el.find("time").first().attr("datetime");
    if (timeStr) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    articles.push({
      source: "wwd",
      sourceName: "WWD JAPAN",
      title,
      description,
      url,
      publishedAt,
    });
  });

  return articles;
}
