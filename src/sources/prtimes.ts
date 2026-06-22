import * as cheerio from "cheerio";
import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";

const PAGE_URL = "https://prtimes.jp/beauty/";
const BASE = "https://prtimes.jp";

export async function fetchPrtimes(): Promise<RawArticle[]> {
  const html = await fetchText(PAGE_URL);
  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];
  const seen = new Set<string>();

  // PR TIMES は /main/html/rd/p/ 配下のリリースを大量に出す。article 単位もしくはリリースカードを拾う
  $("a[href*='/main/html/rd/']").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : new URL(href, BASE).toString();
    if (seen.has(url)) return;
    seen.add(url);

    // タイトルは a 直下、または周辺の h タグ
    let title = $a.attr("title")?.trim() || $a.text().trim();
    if (!title || title.length < 6) {
      title =
        $a.closest("article").find("h2,h3").first().text().trim() ||
        $a.parent().find("h2,h3").first().text().trim();
    }
    if (!title || title.length < 6) return;

    // 説明は親要素の p から
    const description =
      $a.closest("article").find("p").first().text().trim() ||
      $a.parent().find("p").first().text().trim();

    // 日時は data-* に入ってることがあるが、無くても運用上問題ない
    let publishedAt: Date | null = null;
    const timeStr =
      $a.closest("article").find("time").first().attr("datetime") ||
      $a.parent().find("time").first().attr("datetime");
    if (timeStr) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    articles.push({
      source: "prtimes",
      sourceName: "PR TIMES",
      title,
      description,
      url,
      publishedAt,
    });
  });

  return articles;
}
