import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScoredArticle } from "./types.ts";

// shiroco skill が「直近の業界トレンド事例」として参照するファイルを書き出す。
// 朝のダイジェスト LIVE 実行のたびに、当月ファイル末尾にその日のエントリを append する。
// shiroco SKILL.md は ~/Workspace/mb-cosme-news/state/trends/ を pointer として持つ。
const TRENDS_DIR = path.resolve(process.cwd(), "state", "trends");

export async function appendTrends(
  selected: ScoredArticle[],
  runDate: Date = new Date(),
): Promise<void> {
  if (selected.length === 0) return;
  await fs.mkdir(TRENDS_DIR, { recursive: true });

  const ym = formatYearMonth(runDate);
  const ymd = formatYmdJa(runDate);
  const file = path.join(TRENDS_DIR, `${ym}.md`);

  let existing = "";
  try {
    existing = await fs.readFile(file, "utf-8");
  } catch {
    // 新規月
  }
  if (!existing) {
    existing = buildMonthHeader(ym);
  }

  // 同日のセクションがすでにあれば、新しい記事を末尾に追記（毎日 1 回想定だが冪等性のため）
  const dayHeading = `## ${ymd}`;
  const block = renderDayBlock(selected);

  let next: string;
  if (existing.includes(dayHeading)) {
    next = existing.replace(
      new RegExp(`(${escapeRe(dayHeading)}[\\s\\S]*?)(?=\\n## |\\n?$)`),
      `$1${block}`,
    );
  } else {
    next = `${existing.trimEnd()}\n\n${dayHeading}\n${block}\n`;
  }

  await fs.writeFile(file, next, "utf-8");
}

function buildMonthHeader(ym: string): string {
  return [
    `# 業界トレンド事例 ${ym}`,
    "",
    "mb-cosme-news 朝のダイジェスト（平日 09:50 JST）で最終選定された記事のログ。",
    "各エントリは LLM がメビウス文脈で関連度高と判定し Slack 投稿に使われたもの。",
    "shiroco skill から「直近の業界トレンド事例」として参照する。",
    "",
  ].join("\n");
}

function renderDayBlock(selected: ScoredArticle[]): string {
  const lines: string[] = [];
  for (const a of selected) {
    lines.push("");
    lines.push(`### [${a.sourceName}] ${a.title}`);
    lines.push(`- URL: ${a.url}`);
    lines.push(`- angle: ${a.angle}`);
    if (a.publishedAt) {
      lines.push(`- published: ${a.publishedAt.toISOString()}`);
    }
    lines.push(`- summary: ${a.summary}`);
    lines.push(`- whyForMebius: ${a.whyForMebius}`);
  }
  return lines.join("\n");
}

function formatYearMonth(d: Date): string {
  // JST 基準
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatYmdJa(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const dow = ["日", "月", "火", "水", "木", "金", "土"][jst.getUTCDay()];
  return `${y}-${m}-${day} (${dow})`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
