import type { RawArticle } from "../types.ts";
import { fetchText } from "../fetcher.ts";

// 2026-07-08: 旧 https://www.biteki.com/feed（RSS）が 404 になったため、
// WordPress の JSON REST API に切り替え。/wp-json/wp/v2/posts は 200 で生きている。
const API_URL =
  "https://www.biteki.com/wp-json/wp/v2/posts?per_page=30&_fields=id,link,title,excerpt,date";

interface WpPost {
  id: number;
  link: string;
  date: string; // ISO 8601 例: "2026-07-08T12:00:00"
  title: { rendered: string };
  excerpt?: { rendered: string };
}

export async function fetchBiteki(): Promise<RawArticle[]> {
  const body = await fetchText(API_URL);
  let posts: WpPost[];
  try {
    posts = JSON.parse(body) as WpPost[];
  } catch {
    // 期待外のレスポンス（HTML など）は 0 件で返す
    return [];
  }
  if (!Array.isArray(posts)) return [];

  const articles: RawArticle[] = [];
  for (const p of posts) {
    if (!p?.link || !p?.title?.rendered) continue;
    const title = decodeHtml(p.title.rendered).trim();
    if (!title) continue;
    const description = p.excerpt?.rendered
      ? decodeHtml(p.excerpt.rendered).slice(0, 500)
      : "";
    let publishedAt: Date | null = null;
    if (p.date) {
      const d = new Date(p.date);
      if (!isNaN(d.getTime())) publishedAt = d;
    }
    articles.push({
      source: "biteki",
      sourceName: "美的",
      title,
      description,
      url: p.link,
      publishedAt,
    });
  }
  return articles;
}

// WordPress の title.rendered / excerpt.rendered は HTML タグとエンティティ入りなので剥がす
function decodeHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
