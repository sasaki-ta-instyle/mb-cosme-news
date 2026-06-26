import { promises as fs } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";

// bot に渡す custom tool 定義とその executor。
// シロコ bot 用に、mb-cosme-news の朝のダイジェスト由来の業界トレンド事例ログを参照する。

const TRENDS_DIR = path.resolve(process.cwd(), "state", "trends");
const TRENDS_MAX_CHARS = 12_000; // 1 ツール呼び出しあたりの戻り値上限

export const CUSTOM_TOOLS = [
  {
    name: "read_trends_log",
    description:
      "mb-cosme-news の朝のダイジェスト由来、メビウス文脈で関連度高と LLM が判定した直近の業界トレンド事例ログ（WWD JAPAN / FASHIONSNAP / PR TIMES / @cosme / 美的 / VOCE 由来、最大 5 件/日）を読み出す。商品企画・マーケトレンド・オファー設計・PR 施策・競合動向・直近の同業の動き等の質問でユーザーが具体的事例を求めているときに使う。1 回の呼び出しで指定月（または当月）の 1 ファイル分を返す。一次情報の代替ではなく、具体引用したい時は元 URL を web_search で当てに行く。",
    input_schema: {
      type: "object" as const,
      properties: {
        year_month: {
          type: "string" as const,
          description:
            "参照したい月を YYYY-MM 形式で指定する。省略時は当月（JST）。古いログは原則 2 ヶ月以内が「最新トレンド」扱い。",
          pattern: "^\\d{4}-\\d{2}$",
        },
      },
      required: [],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "read_trends_log") {
    return await readTrendsLog(input);
  }
  return `(unknown tool: ${name})`;
}

async function readTrendsLog(
  input: Record<string, unknown>,
): Promise<string> {
  const raw = typeof input.year_month === "string" ? input.year_month : "";
  const ym = /^\d{4}-\d{2}$/.test(raw) ? raw : currentYearMonthJst();
  const file = path.join(TRENDS_DIR, `${ym}.md`);
  try {
    const text = await fs.readFile(file, "utf-8");
    if (text.length <= TRENDS_MAX_CHARS) return text;
    // 末尾 = 最新セクションを優先して返す
    return (
      `(${ym} のログから直近分のみ抜粋。古い前半は省略)\n\n` +
      text.slice(-TRENDS_MAX_CHARS)
    );
  } catch {
    return `(${ym} の trends ログは見つかりませんでした。月初や祝日続きで未蓄積の可能性があります。)`;
  }
}

function currentYearMonthJst(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Anthropic SDK の型に合わせて返すヘルパー（loop で使う）
export function buildToolResultBlock(
  tool_use_id: string,
  content: string,
): Anthropic.MessageParam {
  return {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id,
        content,
      },
    ],
  };
}
