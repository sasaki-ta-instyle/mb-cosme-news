import type { RawArticle } from "../types.ts";
import { fetchWwd } from "./wwd.ts";
import { fetchFashionsnap } from "./fashionsnap.ts";
import { fetchPrtimes } from "./prtimes.ts";
import { fetchCosme } from "./cosme.ts";

const FETCHERS: Record<string, () => Promise<RawArticle[]>> = {
  wwd: fetchWwd,
  fashionsnap: fetchFashionsnap,
  prtimes: fetchPrtimes,
  cosme: fetchCosme,
};

export async function fetchAll(sourceIds: string[]): Promise<{
  articles: RawArticle[];
  errors: Array<{ source: string; error: string }>;
}> {
  const articles: RawArticle[] = [];
  const errors: Array<{ source: string; error: string }> = [];

  const results = await Promise.allSettled(
    sourceIds.map(async (id) => {
      const fn = FETCHERS[id];
      if (!fn) throw new Error(`unknown source: ${id}`);
      const list = await fn();
      return { id, list };
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      articles.push(...r.value.list);
      if (r.value.list.length === 0) {
        errors.push({
          source: r.value.id,
          error: "0 件しか取れなかった（セレクタが壊れた可能性あり）",
        });
      }
    } else {
      errors.push({
        source: "unknown",
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  return { articles, errors };
}
