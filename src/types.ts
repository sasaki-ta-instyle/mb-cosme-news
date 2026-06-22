export interface RawArticle {
  source: string;
  sourceName: string;
  title: string;
  description: string;
  url: string;
  publishedAt: Date | null;
}

export interface NormalizedArticle extends RawArticle {
  id: string;
  canonicalUrl: string;
}

export interface ScoredArticle extends NormalizedArticle {
  score: number;
  angle: "product" | "marketing" | "ranking" | "pr" | "trend" | "noise";
  summary: string;
  whyForMebius: string;
}
