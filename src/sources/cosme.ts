import * as cheerio from "cheerio";
import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";

const PAGE_URL = "https://www.cosme.net/news/";
const BASE = "https://www.cosme.net";

export async function fetchCosme(): Promise<RawArticle[]> {
  const html = await fetchText(PAGE_URL);
  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];
  const seen = new Set<string>();

  // @cosme の /news/ は カード型。記事リンクは /news/ 配下のサブパス
  $("a[href*='/news/']").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;
    // /news/ ページ自体や category top は除外
    if (/\/news\/?($|\?)/.test(href)) return;
    const url = href.startsWith("http") ? href : new URL(href, BASE).toString();
    if (seen.has(url)) return;
    seen.add(url);

    let title = $a.attr("title")?.trim() || $a.text().trim();
    if (!title || title.length < 6) {
      title =
        $a.closest("article").find("h2,h3").first().text().trim() ||
        $a.parent().find("h2,h3").first().text().trim();
    }
    if (!title || title.length < 6) return;

    const description =
      $a.closest("article").find("p").first().text().trim() ||
      $a.parent().find("p").first().text().trim();

    let publishedAt: Date | null = null;
    const timeStr =
      $a.closest("article").find("time").first().attr("datetime") ||
      $a.parent().find("time").first().attr("datetime");
    if (timeStr) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    articles.push({
      source: "cosme",
      sourceName: "@cosme",
      title,
      description,
      url,
      publishedAt,
    });
  });

  return articles;
}
