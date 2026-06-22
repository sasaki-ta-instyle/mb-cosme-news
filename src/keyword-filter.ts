import type { NormalizedArticle } from "./types.ts";
import { matchesAnyKeyword } from "../config/keywords.ts";

export function keywordFilter(articles: NormalizedArticle[]): NormalizedArticle[] {
  return articles.filter((a) => {
    const text = `${a.title}\n${a.description}`;
    return matchesAnyKeyword(text);
  });
}
