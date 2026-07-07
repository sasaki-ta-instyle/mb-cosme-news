import * as cheerio from "cheerio";
import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";

// @cosme for BUSINESS（istyle 運営、化粧品業界の B 向けサイト）
// 2026-07-07 に旧 cosme.net/news/ 廃止 → business.cosme.net の 3 カテゴリを統合するように変更。
// - /column : 業界トレンド解説（メビウス文脈で最重要）
// - /case   : @cosme business の導入事例（他社ブランド動向）
// - /info   : お知らせ（優先度は低いが件数が少ないので同居）
const BASE = "https://business.cosme.net";
// hsLang=ja-jp クエリを付けるとサーバー側が 307 で削って redirect するので、
// 最初から query 無しで叩く（undici の request は redirect を追わない挙動のため）
const CATEGORY_URLS = [
  `${BASE}/column`,
  `${BASE}/case`,
  `${BASE}/info`,
];

// 記事詳細 URL: /column/<slug>, /column/<sub>/<slug>, /case/<slug>, /info/<slug>
const ARTICLE_HREF_RE = /^\/(?:column|case|info)\/[a-z0-9_-]+/i;
// 一覧ページのトップ（/column, /column/, /column?, ...）は除外
const CATEGORY_TOP_RE = /^\/(?:column|case|info)\/?(?:\?|$)/i;
// タグ / カテゴリ / 検索アーカイブは記事ではないので除外
const NON_ARTICLE_RE = /\/(?:tag|category|search|author)\//i;
// 日付は「YYYY.MM.DD」or「YYYY年MM月DD日」（タイトル先頭 or 近傍テキスト）
const DATE_RE = /(\d{4})[./年](\d{1,2})[./月](\d{1,2})/;
// タイトル先頭に日付が入っている場合はそれを削って日付として使う
const TITLE_LEADING_DATE_RE = /^(\d{4})[./](\d{1,2})[./](\d{1,2})\s+/;

async function fetchOnePage(url: string): Promise<RawArticle[]> {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];
  const seen = new Set<string>();

  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;
    // 絶対 URL 相対 URL 両対応で path だけ取り出す
    let path: string;
    try {
      path = href.startsWith("http") ? new URL(href).pathname : href.split("?")[0] ?? href;
    } catch {
      return;
    }
    if (CATEGORY_TOP_RE.test(path)) return;
    if (NON_ARTICLE_RE.test(path)) return;
    if (!ARTICLE_HREF_RE.test(path)) return;

    // canonical URL は query 無しで統一（重複除去のため）
    const abs = new URL(path, BASE);
    abs.search = "";
    const absUrl = abs.toString();
    if (seen.has(absUrl)) return;
    seen.add(absUrl);

    let title = $a.text().trim().replace(/\s+/g, " ");
    if (!title || title.length < 6) return;

    // タイトル先頭に「YYYY.MM.DD 」形式で日付が入っている場合はそれを優先
    let publishedAt: Date | null = null;
    const leading = title.match(TITLE_LEADING_DATE_RE);
    if (leading) {
      const d = new Date(Number(leading[1]), Number(leading[2]) - 1, Number(leading[3]));
      if (!isNaN(d.getTime())) publishedAt = d;
      title = title.replace(TITLE_LEADING_DATE_RE, "").trim();
    }
    // タイトルに日付が無ければ親要素テキストから拾う（4 段まで遡る）
    if (publishedAt === null) {
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
    }

    articles.push({
      source: "cosme",
      sourceName: "@cosme",
      title,
      description: "",
      url: absUrl,
      publishedAt,
    });
  });

  return articles;
}

export async function fetchCosme(): Promise<RawArticle[]> {
  const results: RawArticle[] = [];
  const seen = new Set<string>();
  for (const url of CATEGORY_URLS) {
    try {
      const list = await fetchOnePage(url);
      for (const a of list) {
        if (seen.has(a.url)) continue;
        seen.add(a.url);
        results.push(a);
      }
    } catch {
      // 1 カテゴリの失敗で他を落とさない
      continue;
    }
  }
  return results;
}
