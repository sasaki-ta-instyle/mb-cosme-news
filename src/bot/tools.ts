import { promises as fs } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";

// bot に渡す custom tool 定義とその executor。
// シロコ bot 用に、以下の外部リソースへ委譲する:
//  1. read_trends_log         — 朝のダイジェスト由来の業界トレンド事例ログ（ローカル状態）
//  2. shiroco_search           — mac mini 上の shiroco v2 RAG（業界書 27 冊 + JAPAL 通知の意味検索）
//  3. search_japal_notices     — 同 shiroco v2 の /api/japal/search（校閲・校正専用）
//  4. shiroco_compare          — 同 shiroco v2 の /api/compare（業界平均 × メビウス実数の比較検証）

const TRENDS_DIR = path.resolve(process.cwd(), "state", "trends");
const TRENDS_MAX_CHARS = 12_000; // 1 ツール呼び出しあたりの戻り値上限

// shiroco v2 RAG サーバー（Mac mini 常駐 FastAPI、itaco とは別サービス）
const SHIROCO_V2_BASE_URL = process.env.SHIROCO_V2_BASE_URL?.trim() ?? "";
const SHIROCO_V2_API_KEY = process.env.SHIROCO_V2_API_KEY?.trim() ?? "";
const SHIROCO_V2_PROBE_TIMEOUT_MS = 3_000;
const SHIROCO_V2_SEARCH_TIMEOUT_MS = 10_000;
const SHIROCO_V2_MAX_CHARS = 12_000;
// /api/compare は BQ 実行を経由するので長め（mb-bq-portal の dryRun + execute + summarize を含む）
const SHIROCO_V2_COMPARE_TIMEOUT_MS = 60_000;

export const CUSTOM_TOOLS = [
  {
    name: "read_trends_log",
    description:
      "mb-cosme-news の朝のダイジェスト由来、メビウス文脈で関連度高と LLM が判定した直近の業界トレンド事例ログ（WWD JAPAN / FASHIONSNAP / PR TIMES / 美的 / VOCE 由来、最大 5 件/日）を読み出す。商品企画・マーケトレンド・オファー設計・PR 施策・競合動向・直近の同業の動き等の質問でユーザーが具体的事例を求めているときに使う。1 回の呼び出しで指定月（または当月）の 1 ファイル分を返す。一次情報の代替ではなく、具体引用したい時は元 URL を web_search で当てに行く。",
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
  {
    name: "shiroco_search",
    description:
      "Mac mini 上の shiroco v2 RAG サーバー（BGE-M3 + Chroma）で、化粧品 D2C / EC / 通販マーケの業界書 27 冊 + JAPAL 通知（薬事・広告表現規制の一次データ）を横断意味検索する。「うちのターゲットはどう考えるべき」「LTV 最大化の原則」「オファー設計」「D2C vs モール」等の判断・執筆で **まず先に** これを叩いて素材を当てに行く。web_search より精度の高い一次資料。返り値は path + authority_tag + score + snippet。tool が『shiroco v2 サーバー未応答』を返したら persona 内圧縮版 + web_search で回答する（フォールバック）。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description:
            "自然文の検索クエリ。1〜3 文の日本語（英語混じり可）。例: 「化粧品 D2C の解約率を下げる打ち手」「STP のフレームワーク」「トライアルセットの罠」",
          minLength: 3,
        },
        top_k: {
          type: "integer" as const,
          description: "返す件数。既定 5、最大 15",
          minimum: 1,
          maximum: 15,
          default: 5,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "shiroco_compare",
    description:
      "shiroco v2 の /api/compare を叩いて **業界平均（業界書）× メビウス実数（BigQuery `mebius-prod.*`）× GDrive 実績シート** を並べて返す **比較検証モード** 専用ツール。「うちの LTV は業界と比べて高い？」「解約率の実数と業界目安の差から何が言える？」「CPA 実績と業界平均の乖離をどう解釈すべき？」など、業界平均だけでは足りず **メビウス実データとの突合が必要な質問** で使う。返り値は 4 セクション（1 KPI 抽出結果 / 2 業界平均ヒット / 3 メビウス実数 = BQ / 4 GDrive 実績シート）+ notes（フォールバック理由）+ compare_ready フラグを Markdown 断片で返す。**BQ が未起動 or 未認証 or fileId 未索引の場合は業界平均のみモードで返る**（notes に理由）。数値の一人歩き防止のため、実数を Slack で提示するときは必ず「BQ 実行日 + ビュー名」を併記し、比較結果を LP / 広告 / 対外資料に転用しない旨を末尾に明示すること。断定は禁止（「〜ではないか」形式で問い / 可能性を提示）。",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string" as const,
          description:
            "比較検証したい問い。1〜3 文の日本語。例: 「メビウスの定期解約率は業界平均と比べてどう？」「LTV 実数と業界目安の差から改善余地は？」",
          minLength: 3,
        },
        kpi_hint: {
          type: "string" as const,
          description:
            "対象 KPI を明示的に指定したい場合のヒント。省略すると質問文から自動推論。canonical: LTV / 解約率 / CPA / F2転換率 / CVR / ROAS / 新規獲得件数 / 定期継続率",
        },
        top_k: {
          type: "integer" as const,
          description: "業界書ヒットの件数。既定 5、最大 15",
          minimum: 1,
          maximum: 15,
          default: 5,
        },
      },
      required: ["question"],
    },
  },
  {
    name: "search_japal_notices",
    description:
      "JAPAL（日本薬事法務学会）由来の薬事・広告表現規制の一次通知だけに絞って意味検索する。**化粧品 LP / EC / プレスリリース / SNS 投稿の校閲・校正モード専用**。「校閲して」「薬機法チェック」「景表法観点」「広告表現大丈夫？」「NG 表現ある？」「効果効能の書き方」の質問で使う。返り値は発出日 + 発出主体 + タイトル + URL を含んだ Markdown 断片。引用時は **発出主体 + 発出日 + URL の三点併記** が必須。断定判定は禁止（「〜違反です」と言い切らない、「〜の可能性が高いので法務確認」まで）。ヒット 0 件のときは業界書側の Law 10 / Day 27 系を shiroco_search で拾い直す。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description:
            "校閲観点のキーワード。例: 「シワ改善 化粧品 表現」「エイジングケア 効果効能」「医師推奨 優良誤認」「敏感肌 断定」",
          minLength: 3,
        },
        top_k: {
          type: "integer" as const,
          description: "返す件数。既定 5、最大 15",
          minimum: 1,
          maximum: 15,
          default: 5,
        },
      },
      required: ["query"],
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
  if (name === "shiroco_search") {
    return await shirocoSearch(input, "/api/search");
  }
  if (name === "search_japal_notices") {
    return await shirocoSearch(input, "/api/japal/search");
  }
  if (name === "shiroco_compare") {
    return await shirocoCompare(input);
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

// ---------- shiroco v2 RAG サーバーへの proxy ----------

type ShirocoHit = {
  path: string;
  heading_path: string;
  authority_tag: string;
  final_score: number;
  snippet: string | null;
};

async function _probeShirocoV2(): Promise<string | null> {
  if (!SHIROCO_V2_BASE_URL) return null;
  const base = SHIROCO_V2_BASE_URL.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHIROCO_V2_PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (SHIROCO_V2_API_KEY) headers["authorization"] = `Bearer ${SHIROCO_V2_API_KEY}`;
    const resp = await fetch(`${base}/healthz`, { headers, signal: controller.signal });
    if (!resp.ok) return null;
    return base;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function shirocoSearch(
  input: Record<string, unknown>,
  endpoint: "/api/search" | "/api/japal/search",
): Promise<string> {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const topK =
    typeof input.top_k === "number" ? Math.min(Math.max(input.top_k | 0, 1), 15) : 5;
  if (!query) return "(shiroco_search: query が空です)";

  const base = await _probeShirocoV2();
  if (!base) {
    return (
      "(shiroco v2 サーバー未応答)\n" +
      "Mac mini 上の shiroco RAG サーバーが到達不能です。以下のいずれかで応答継続してください:\n" +
      "- persona 内の圧縮版素材だけで答える\n" +
      "- web_search で JAPAL / 業界書関連の該当ページを当てに行く\n" +
      "- ユーザーに「shiroco v2 が停止中なので回答品質が下がる」を明示"
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHIROCO_V2_SEARCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (SHIROCO_V2_API_KEY) headers["authorization"] = `Bearer ${SHIROCO_V2_API_KEY}`;
    const resp = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, top_k: topK, include_snippet: true }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return `(shiroco v2 ${endpoint} が ${resp.status} を返しました: ${body.slice(0, 200)})`;
    }
    const data = (await resp.json()) as { count: number; results: ShirocoHit[] };
    if (!data.results?.length) {
      return (
        `(shiroco v2 ${endpoint}: query="${query}" で 0 件)\n` +
        (endpoint === "/api/japal/search"
          ? "JAPAL 側では該当通知が無い可能性が高い。業界書側（赤本 Law 10 / 青本 Day 27）を shiroco_search で拾い直すか、web_search で JAPAL カテゴリ URL を直接叩いて再確認する。"
          : "検索クエリの表現を変えるか、web_search で外部情報を当てに行く。")
      );
    }
    const lines: string[] = [`shiroco v2 ${endpoint} (query="${query}", ${data.count} 件):\n`];
    for (const r of data.results) {
      lines.push(
        `- **${r.authority_tag}** ${r.path}` +
          (r.heading_path ? ` > ${r.heading_path}` : "") +
          ` (score=${r.final_score.toFixed(3)})`,
      );
      if (r.snippet) lines.push(`  ${r.snippet}`);
    }
    const out = lines.join("\n");
    return out.length > SHIROCO_V2_MAX_CHARS
      ? out.slice(0, SHIROCO_V2_MAX_CHARS) + "\n\n(以下省略)"
      : out;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `(shiroco v2 ${endpoint} 呼び出しでエラー: ${msg})`;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- shiroco v2 /api/compare（比較検証モード）へのプロキシ ----------

type CompareBQSection = {
  available: boolean;
  sql: string | null;
  rows: unknown[] | null;
  row_count: number | null;
  summary: string | null;
  executed_at: string | null;
  bytes_processed: number | null;
  error: string | null;
  error_kind: string | null;
};

type CompareDriveHit = {
  path: string;
  mtime: number;
  size_bytes: number;
  snippet: string;
};

type CompareDriveSection = {
  available: boolean;
  matched_files: CompareDriveHit[];
  error: string | null;
  scanned_root: string | null;
};

type CompareResponse = {
  question: string;
  kpi_extracted: string | null;
  industry_hits: ShirocoHit[];
  mebius_actual: CompareBQSection;
  mebius_drive: CompareDriveSection;
  compare_ready: boolean;
  notes: string[];
};

async function shirocoCompare(input: Record<string, unknown>): Promise<string> {
  const question =
    typeof input.question === "string" ? input.question.trim() : "";
  const kpiHint =
    typeof input.kpi_hint === "string" && input.kpi_hint.trim()
      ? input.kpi_hint.trim()
      : null;
  const topK =
    typeof input.top_k === "number"
      ? Math.min(Math.max(input.top_k | 0, 1), 15)
      : 5;
  if (!question) return "(shiroco_compare: question が空です)";

  const base = await _probeShirocoV2();
  if (!base) {
    return (
      "(shiroco v2 サーバー未応答)\n" +
      "Mac mini 上の shiroco RAG サーバーが到達不能で /api/compare が使えません。以下で対応してください:\n" +
      "- persona 内圧縮版と shiroco_search（もし復旧すれば）で業界平均のみ答える\n" +
      "- BQ 実数の比較検証は今回は諦め、次回サーバー復旧時に再質問してもらう\n" +
      "- ユーザーに「shiroco v2 停止中のため、業界平均のみで応答している」を明示"
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    SHIROCO_V2_COMPARE_TIMEOUT_MS,
  );
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (SHIROCO_V2_API_KEY) headers["authorization"] = `Bearer ${SHIROCO_V2_API_KEY}`;
    const body: Record<string, unknown> = { question, top_k: topK };
    if (kpiHint) body.kpi_hint = kpiHint;
    const resp = await fetch(`${base}/api/compare`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      return `(shiroco v2 /api/compare が ${resp.status} を返しました: ${bodyText.slice(0, 200)})`;
    }
    const data = (await resp.json()) as CompareResponse;

    const lines: string[] = [];
    lines.push(`shiroco v2 /api/compare (question="${question}")`);
    lines.push(
      `- KPI 抽出: ${data.kpi_extracted ?? "推論不可（業界平均のみモード想定）"}`,
    );
    lines.push(`- compare_ready: ${data.compare_ready ? "はい" : "いいえ"}`);
    if (data.notes.length > 0) {
      lines.push("- notes:");
      for (const n of data.notes) lines.push(`  - ${n}`);
    }

    // 業界平均
    lines.push("");
    lines.push(`## 業界平均（industry_hits: ${data.industry_hits.length} 件）`);
    if (data.industry_hits.length === 0) {
      lines.push("- ヒット無し。KPI 別 map を確認し query を言い換える");
    } else {
      for (const h of data.industry_hits) {
        lines.push(
          `- **${h.authority_tag}** ${h.path}` +
            (h.heading_path ? ` > ${h.heading_path}` : "") +
            ` (score=${h.final_score.toFixed(3)})`,
        );
        if (h.snippet) lines.push(`  ${h.snippet}`);
      }
    }

    // メビウス実数（BQ）
    lines.push("");
    lines.push("## メビウス実数（BigQuery）");
    if (data.mebius_actual.available) {
      lines.push(`- 実行日時: ${data.mebius_actual.executed_at ?? "不明"}`);
      if (data.mebius_actual.row_count != null) {
        lines.push(`- 行数: ${data.mebius_actual.row_count}`);
      }
      if (data.mebius_actual.summary) {
        lines.push(`- サマリ: ${data.mebius_actual.summary}`);
      }
      if (data.mebius_actual.sql) {
        const sql = data.mebius_actual.sql.slice(0, 500);
        lines.push("- 実行 SQL（先頭 500 字）:");
        lines.push("```sql");
        lines.push(sql);
        lines.push("```");
      }
      if (data.mebius_actual.rows && data.mebius_actual.rows.length > 0) {
        const preview = JSON.stringify(data.mebius_actual.rows.slice(0, 5));
        lines.push(`- 上位 5 行: ${preview.slice(0, 400)}`);
      }
    } else {
      lines.push(
        `- **取得できず** (${data.mebius_actual.error_kind ?? "unknown"}): ${data.mebius_actual.error ?? ""}`,
      );
      lines.push("- Slack では「業界平均のみで応答」の旨を必ず明示すること");
    }

    // GDrive 実績シート
    lines.push("");
    lines.push("## GDrive 実績シート（rclone 同期先）");
    if (!data.mebius_drive.available) {
      lines.push(`- 走査不可: ${data.mebius_drive.error ?? "unknown"}`);
    } else if (data.mebius_drive.matched_files.length === 0) {
      lines.push("- 該当ファイルなし。INDEX の索引化推奨（fileId 手動登録）");
    } else {
      for (const f of data.mebius_drive.matched_files) {
        const mtime = new Date(f.mtime * 1000).toISOString().slice(0, 10);
        lines.push(`- ${f.path} (mtime=${mtime}, size=${f.size_bytes}B)`);
        if (f.snippet) lines.push(`  ${f.snippet.slice(0, 200)}`);
      }
    }

    // Slack 出力側への注意事項
    lines.push("");
    lines.push("## 呼び出し側（bot）が出力時に守ること");
    lines.push(
      "- 4 セクション固定: 業界平均 / メビウス実数（出典: BQ ビュー + 実行日）/ 差分と解釈 / 引き出せる問い（〜ではないか形式、最大 3 件）",
    );
    lines.push(
      "- 実数が取れなかった時は「業界平均のみモード」と明示、復旧手順を 1〜2 行で示す",
    );
    lines.push(
      "- 数値の一人歩き防止のため、末尾に「対内部分析用、LP / 広告 / 対外資料に転用不可」を必ず添える",
    );
    lines.push("- 断定禁止（「〜ではないか」「〜の可能性がある」で締める）");

    const out = lines.join("\n");
    return out.length > SHIROCO_V2_MAX_CHARS
      ? out.slice(0, SHIROCO_V2_MAX_CHARS) + "\n\n(以下省略)"
      : out;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `(shiroco v2 /api/compare 呼び出しでエラー: ${msg})`;
  } finally {
    clearTimeout(timer);
  }
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
