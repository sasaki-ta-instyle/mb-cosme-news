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

    // タイトルは a 内の h タグ → title 属性 → 周辺の h タグ → a 内テキストから抽出
    let title =
      $a.find("h2,h3,h4").first().text().trim() ||
      $a.attr("title")?.trim() ||
      $a.closest("article").find("h2,h3").first().text().trim() ||
      $a.parent().find("h2,h3").first().text().trim() ||
      "";

    // フォールバック: a 内の全テキストから「日付」「時刻」「社名」「分前」を除いた最長セグメント
    if (!title || title.length < 6) {
      const segments = $a
        .text()
        .split(/[\n\r]+|\s{3,}/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 6);
      const candidates = segments.filter(
        (s) =>
          !/^\d{4}年/.test(s) &&
          !/(分前|時間前|日前)$/.test(s) &&
          !/^(株式会社|有限会社|合同会社|一般社団法人)/.test(s) &&
          !/(株式会社|有限会社|合同会社)$/.test(s),
      );
      title =
        candidates.sort((a, b) => b.length - a.length)[0] ||
        segments[0] ||
        "";
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
