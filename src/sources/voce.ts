import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";
import { ARTICLE_LOOKBACK_HOURS } from "../../config/sources.ts";

const INDEX_URL = "https://i-voce.jp/sitemaps/sitemap_article.xml";

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

  return articles;
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
