import { createHash } from "node:crypto";
import type { NormalizedArticle, RawArticle } from "./types.ts";
import { ARTICLE_LOOKBACK_HOURS } from "../config/sources.ts";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "ref",
  "ref_src",
  "ref_url",
]);

export function canonicalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.hash = "";
    const cleaned = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(k)) cleaned.append(k, v);
    }
    u.search = cleaned.toString();
    // 末尾スラッシュは残す/消すで二重カウントしやすいので正規化
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return input;
  }
}

export function hashUrl(canonical: string): string {
  return createHash("sha1").update(canonical).digest("hex").slice(0, 16);
}

export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^\d+\s+/, "") // PR TIMES などのリスト番号を除去
    .trim();
}

export function normalize(raw: RawArticle): NormalizedArticle {
  const canonical = canonicalizeUrl(raw.url);
  return {
    ...raw,
    title: normalizeTitle(raw.title),
    description: stripHtml(raw.description).slice(0, 500),
    canonicalUrl: canonical,
    id: hashUrl(canonical),
  };
}

export function withinLookback(article: RawArticle, now: Date = new Date()): boolean {
  if (!article.publishedAt) return true; // 日時不明は通す（古いとは限らない）
  const diffMs = now.getTime() - article.publishedAt.getTime();
  return diffMs >= 0 && diffMs <= ARTICLE_LOOKBACK_HOURS * 60 * 60 * 1000;
}
