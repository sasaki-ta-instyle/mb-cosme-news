import Anthropic from "@anthropic-ai/sdk";
import { PERSONA_SYSTEM_PROMPT } from "./persona.ts";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

export interface AskInput {
  userText: string;
}

export async function answerQuestion(input: AskInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "(ANTHROPIC_API_KEY が未設定です。bot 管理者に連絡してください)";
  }
  const client = new Anthropic({ apiKey });

  const trimmed = input.userText.trim();
  if (!trimmed) {
    return "質問内容が空でした。聞きたいことを書いてからもう一度送ってください。";
  }

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PERSONA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: trimmed }],
    });

    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    return text || "(モデルが空応答を返しました。質問を変えて再試行してください)";
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error("[bot/handler] API error:", msg);
    return `すみません、回答生成でエラーが出ました: ${msg.slice(0, 200)}`;
  }
}
