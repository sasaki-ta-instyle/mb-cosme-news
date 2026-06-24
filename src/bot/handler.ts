import Anthropic from "@anthropic-ai/sdk";
import { PERSONA_SYSTEM_PROMPT } from "./persona.ts";
import { appendToThread, loadThread } from "./thread-memory.ts";
import { CUSTOM_TOOLS, executeTool } from "./tools.ts";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;
const WEB_SEARCH_MAX_USES = 3;
const TOOL_LOOP_MAX_ITERATIONS = 6;

export interface AskInput {
  userText: string;
  threadTs?: string; // 与えられたらこの thread の過去履歴を引いて messages に挿入
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

  // 過去履歴の読み込み（あれば）
  const history = input.threadTs ? await loadThread(input.threadTs) : [];
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: trimmed },
  ];

  const tools = [
    {
      type: "web_search_20250305" as const,
      name: "web_search",
      max_uses: WEB_SEARCH_MAX_USES,
    } as never, // Anthropic SDK 型に built-in tool 形がまだ無いので as never で抑止
    ...CUSTOM_TOOLS,
  ];

  try {
    let res: Anthropic.Message | null = null;
    for (let iter = 0; iter < TOOL_LOOP_MAX_ITERATIONS; iter++) {
      res = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: PERSONA_SYSTEM_PROMPT,
        tools,
        messages,
      });

      console.log(
        "[bot/handler] iter=" +
          iter +
          " thread=" +
          (input.threadTs ?? "none") +
          " stop=" +
          res.stop_reason +
          " blocks=" +
          res.content.map((c) => c.type).join(","),
      );

      if (res.stop_reason !== "tool_use") break;

      // custom tool の tool_use を抽出して実行（built-in tool は API 側で完結する）
      const customToolUses = res.content.filter(
        (c): c is Anthropic.ToolUseBlock =>
          c.type === "tool_use" &&
          CUSTOM_TOOLS.some((t) => t.name === c.name),
      );
      if (customToolUses.length === 0) break;

      messages.push({ role: "assistant", content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of customToolUses) {
        const result = await executeTool(
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: result,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    if (!res) {
      return "(モデル呼び出しに失敗しました)";
    }

    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    const reply =
      text || "(モデルが空応答を返しました。質問を変えて再試行してください)";

    // 履歴に追記（thread_ts があるときのみ）
    if (input.threadTs && text) {
      await appendToThread(input.threadTs, trimmed, text);
    }

    return reply;
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error("[bot/handler] API error:", msg);
    return `すみません、回答生成でエラーが出ました: ${msg.slice(0, 200)}`;
  }
}
