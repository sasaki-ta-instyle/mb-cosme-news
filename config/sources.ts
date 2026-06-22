export type SourceKind = "rss" | "scrape";

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
    enabled: true,
  },
];

export const USER_AGENT =
  "mb-cosme-news/1.0 (+contact:sasaki-ta@instyle.group)";

export const FETCH_TIMEOUT_MS = 15_000;

export const ARTICLE_LOOKBACK_HOURS = 48;
