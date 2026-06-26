import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";
import { ARTICLE_LOOKBACK_HOURS } from "../../config/sources.ts";

const INDEX_URL = "https://i-voce.jp/sitemaps/sitemap_article.xml";
// 取得した URL に対して個別ページから og:description を取りに行く上限。
// LLM scoring 前段の description 充実化が目的。HTTP コストとのバランスで決める。
const OG_FETCH_MAX = 25;
const OG_FETCH_CONCURRENCY = 4;

// VOCE は公開 RSS が無く、AI bot UA を全 disallow しているため (robots.txt)、
// 公開を前提とした sitemap_article.xml 経由で「URL + lastmod + image:caption」を
// 拾う。image:caption が記事タイトルとして使われている。
export async function fetchVoce(): Promise<RawArticle[]> {
  const indexXml = await fetchText(INDEX_URL);
  const shardUrls = Array.from(
    indexXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g),
  ).map((m) => m[1]);
  if (shardUrls.length === 0) return [];

  // シャードは番号順 = 古い順。新しい順に処理して lookback を満たしたら止める。
  shardUrls.sort((a, b) => {
    const na = Number(a.match(/_article_(\d+)\.xml/)?.[1] ?? 0);
    const nb = Number(b.match(/_article_(\d+)\.xml/)?.[1] ?? 0);
    return nb - na;
  });

  const cutoff = new Date(
    Date.now() - ARTICLE_LOOKBACK_HOURS * 60 * 60 * 1000,
  );
  const articles: RawArticle[] = [];

  for (const shardUrl of shardUrls.slice(0, 2)) {
    const xml = await fetchText(shardUrl);
    const urlBlocks = xml.split(/<url>/).slice(1);
    let oldestInShard: Date | null = null;
    for (const block of urlBlocks) {
      const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1] ?? "";
      const lastmod = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1];
      const caption =
        block.match(/<image:caption>\s*([\s\S]*?)\s*<\/image:caption>/)?.[1] ??
        "";
      if (!loc || !caption) continue;

      let publishedAt: Date | null = null;
      if (lastmod) {
        const d = new Date(lastmod);
        if (!isNaN(d.getTime())) publishedAt = d;
      }
      if (publishedAt && (!oldestInShard || publishedAt < oldestInShard)) {
        oldestInShard = publishedAt;
      }
      if (publishedAt && publishedAt < cutoff) continue;

      articles.push({
        source: "voce",
        sourceName: "VOCE",
        title: decodeEntities(caption.trim()),
        description: "",
        url: loc,
        publishedAt,
      });
    }
    // このシャードの最古が cutoff より古ければ、これ以上古いシャードは見ない
    if (oldestInShard && oldestInShard < cutoff) break;
  }

  // 直近 lastmod 上位 OG_FETCH_MAX 件に対して og:description を取りに行く。
  // description 空のままだと LLM scoring の天井が低くなり最終 select に入らない問題への対処。
  articles.sort((a, b) => {
    const ta = a.publishedAt?.getTime() ?? 0;
    const tb = b.publishedAt?.getTime() ?? 0;
    return tb - ta;
  });
  const targets = articles.slice(0, OG_FETCH_MAX);
  for (let i = 0; i < targets.length; i += OG_FETCH_CONCURRENCY) {
    const batch = targets.slice(i, i + OG_FETCH_CONCURRENCY);
    await Promise.all(
      batch.map(async (a) => {
        try {
          const html = await fetchText(a.url);
          a.description = extractOgDescription(html).slice(0, 500);
        } catch {
          // 失敗時は description 空のままで継続
        }
      }),
    );
  }

  return articles;
}

function extractOgDescription(html: string): string {
  // <meta property="og:description" content="..."> を抽出（属性順は問わない）
  const m1 = html.match(
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  );
  if (m1) return decodeEntities(m1[1].trim());
  const m2 = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>/i,
  );
  if (m2) return decodeEntities(m2[1].trim());
  // フォールバック: <meta name="description">
  const m3 = html.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  );
  if (m3) return decodeEntities(m3[1].trim());
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
