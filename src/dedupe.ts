import type { NormalizedArticle } from "./types.ts";
import type { SeenMap } from "./state.ts";

// 既配信を除外
export function removeSeen(
  articles: NormalizedArticle[],
  seen: SeenMap,
): NormalizedArticle[] {
  return articles.filter((a) => !seen[a.id]);
}

// ソース間でタイトル類似のものを 1 件に統合（同一プレスリリース横展開の検知）
export function mergeCrossSource(
  articles: NormalizedArticle[],
): NormalizedArticle[] {
  const kept: NormalizedArticle[] = [];
  for (const a of articles) {
    const dup = kept.find((b) => isSimilarTitle(a.title, b.title));
    if (!dup) {
      kept.push(a);
      continue;
    }
    // より本文長が長い側を残す（情報量が多い方）
    if ((a.description?.length ?? 0) > (dup.description?.length ?? 0)) {
      const idx = kept.indexOf(dup);
      kept[idx] = a;
    }
  }
  return kept;
}

function isSimilarTitle(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  // 完全一致でなくても、3-gram 集合の Jaccard が 0.7 以上なら同一視
  if (Math.abs(na.length - nb.length) > Math.max(na.length, nb.length) * 0.5)
    return false;
  const jac = jaccard3gram(na, nb);
  return jac >= 0.7;
}

function normalizeTitle(s: string): string {
  return s
    .replace(/[\s　]+/g, "")
    .replace(/[「」『』【】[\]()（）"'!?！？・,，.。/]/g, "")
    .toLowerCase();
}

function ngrams(s: string, n: number): Set<string> {
  const set = new Set<string>();
  if (s.length < n) {
    set.add(s);
    return set;
  }
  for (let i = 0; i <= s.length - n; i++) set.add(s.slice(i, i + n));
  return set;
}

function jaccard3gram(a: string, b: string): number {
  const sa = ngrams(a, 3);
  const sb = ngrams(b, 3);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  if (union === 0) return 0;
  return inter / union;
}
