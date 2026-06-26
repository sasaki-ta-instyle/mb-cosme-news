import type { ScoredArticle } from "./types.ts";

const MIN_COUNT = 2;
const TARGET_MIN = 3;
const TARGET_MAX = 5;
const PRIMARY_THRESHOLD = 6.0;
const RELAXED_THRESHOLD = 5.0;
const NOISE_THRESHOLD = 4.0;

export function selectTopArticles(scored: ScoredArticle[]): ScoredArticle[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);

  // noise はまず除外
  const denoised = sorted.filter((a) => a.angle !== "noise");

  // 主閾値で集める
  let pool = denoised.filter((a) => a.score >= PRIMARY_THRESHOLD);

  if (pool.length >= TARGET_MIN) {
    return pool.slice(0, TARGET_MAX);
  }

  // 緩めて再収集
  pool = denoised.filter((a) => a.score >= RELAXED_THRESHOLD);
  if (pool.length >= MIN_COUNT) {
    return pool.slice(0, TARGET_MAX);
  }

  // 最低限の足切りだけ
  pool = denoised.filter((a) => a.score >= NOISE_THRESHOLD);
  if (pool.length === 0) return [];
  return pool.slice(0, TARGET_MAX);
}
