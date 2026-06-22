import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { NormalizedArticle, ScoredArticle } from "./types.ts";
import { SYSTEM_PROMPT, buildUserPrompt } from "../config/prompts.ts";

const ScoreItemSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(10),
  angle: z.enum(["product", "marketing", "ranking", "pr", "trend", "noise"]),
  summary: z.string().max(200),
  why_for_mebius: z.string().max(160),
});

const ScoreArraySchema = z.array(ScoreItemSchema);

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 4000;
const BATCH_SIZE = 30; // 1 リクエスト 30 件まで

export async function scoreAndSummarize(
  articles: NormalizedArticle[],
): Promise<ScoredArticle[]> {
  if (articles.length === 0) return [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });

  const scored: ScoredArticle[] = [];
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const payload = batch.map((a) => ({
      id: a.id,
      source: a.sourceName,
      title: a.title,
      description: a.description.slice(0, 300),
      url: a.canonicalUrl,
    }));

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(payload) }],
    });

    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    const parsed = parseJsonArray(text);
    const validated = ScoreArraySchema.safeParse(parsed);
    if (!validated.success) {
      console.error("[llm] JSON validation failed:", validated.error.message);
      console.error("[llm] raw output:", text.slice(0, 500));
      continue;
    }

    const byId = new Map(batch.map((a) => [a.id, a]));
    for (const item of validated.data) {
      const orig = byId.get(item.id);
      if (!orig) continue;
      scored.push({
        ...orig,
        score: item.score,
        angle: item.angle,
        summary: item.summary,
        whyForMebius: item.why_for_mebius,
      });
    }
  }

  return scored;
}

function parseJsonArray(text: string): unknown {
  // モデルがコードフェンスや前置きを混ぜた場合に備えて、最初の [ から最後の ] までを取る
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON array found in LLM output");
  }
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}
