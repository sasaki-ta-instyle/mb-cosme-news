export type SourceKind = "rss" | "scrape" | "sitemap";

export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  enabled: boolean;
}

export const SOURCES: SourceConfig[] = [
  {
    id: "wwd",
    name: "WWD JAPAN",
    kind: "scrape",
    url: "https://www.wwdjapan.com/category/beauty",
    enabled: true,
  },
  {
    id: "fashionsnap",
    name: "FASHIONSNAP",
    kind: "rss",
    url: "https://www.fashionsnap.com/rss.xml",
    enabled: true,
  },
  {
    id: "prtimes",
    name: "PR TIMES",
    kind: "scrape",
    url: "https://prtimes.jp/beauty/",
    enabled: true,
  },
  {
    id: "cosme",
    name: "@cosme",
    kind: "scrape",
    url: "https://www.cosme.net/news/",
    // 2026-06-26: cosme.net/news/ がリストページ機能を失い、記事カード型リンクが
    // HTML に残っていない (header/footer/category top のみ)。Shift_JIS 対応後も
    // breakdown=1 で実質 dead source。LLM トークン無駄遣いになるため一旦 disable。
    // 別途「@cosme のどの URL 群を見るのが正解か」を調査して再有効化する。
    enabled: false,
  },
  {
    id: "biteki",
    // Slack の mrkdwn 自動リンク化を避けるため、表示名は「.com」を含めない。
    // IDN ドメイン「美的.com」は Slack が自動でリンク化して host を Punycode
    // (xn--hxyt6q.com) に変換してしまうため。
    name: "美的",
    kind: "rss",
    url: "https://www.biteki.com/feed",
    enabled: true,
  },
  {
    id: "voce",
    name: "VOCE",
    kind: "sitemap",
    url: "https://i-voce.jp/sitemaps/sitemap_article.xml",
    enabled: true,
  },
];

// WWD JAPAN など Cloudflare 系で素の bot UA を弾くサイトがあるため、
// Chrome を偽装しつつ From: ヘッダで連絡先を明示する（RFC 9110）。
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const FROM_HEADER = "sasaki-ta@instyle.group";

export const FETCH_TIMEOUT_MS = 15_000;

export const ARTICLE_LOOKBACK_HOURS = 48;
