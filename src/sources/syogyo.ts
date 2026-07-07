import * as cheerio from "cheerio";
import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";

const PAGE_URL = "https://www.syogyo.jp/news/news/cat19";
const BASE = "https://www.syogyo.jp";

// 詳細記事の URL パターン: /news/YYYY/MM/post_XXXXXX
const ARTICLE_HREF_RE = /^\/news\/20\d{2}\//;
const DATE_RE = /(\d{4})年(\d{1,2})月(\d{1,2})日/;

export async function fetchSyogyo(): Promise<RawArticle[]> {
  const html = await fetchText(PAGE_URL);
  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];
  const seen = new Set<string>();

  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href || !ARTICLE_HREF_RE.test(href)) return;

    const url = new URL(href, BASE).toString();
    if (seen.has(url)) return;
    seen.add(url);

    const title = $a.text().trim().replace(/\s+/g, " ");
    if (!title || title.length < 6) return;

    // 日付は <time> タグが無く、記事行の近傍テキストに「YYYY年MM月DD日」が入る。
    // 親を数段遡って正規表現でヒットさせる。
    let publishedAt: Date | null = null;
    let $cursor = $a.parent();
    for (let i = 0; i < 4 && $cursor.length > 0; i++) {
      const m = $cursor.text().match(DATE_RE);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!isNaN(d.getTime())) publishedAt = d;
        break;
      }
      $cursor = $cursor.parent();
    }

    articles.push({
      source: "syogyo",
      sourceName: "商業界",
      title,
      description: "",
      url,
      publishedAt,
    });
  });

  return articles;
}
