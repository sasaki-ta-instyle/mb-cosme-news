// Slack thread 単位で会話履歴を保持する。
// 保存場所: state/threads/<thread_ts>.json
// 過去 N=8 ターン（user / assistant 合計 16 件）を保持し、古いものから捨てる。

import { promises as fs } from "node:fs";
import path from "node:path";

const STATE_DIR = path.join(process.cwd(), "state", "threads");
const MAX_TURNS = 8; // user + assistant のペアで 8 = 計 16 件
const MAX_MSGS = MAX_TURNS * 2;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 日

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface ThreadState {
  messages: ThreadMessage[];
  lastUsed: number;
}

function sanitizeKey(threadTs: string): string {
  // ファイル名として使えるよう "." を "_" に
  return threadTs.replace(/[^0-9_]/g, "_");
}

function filePathFor(threadTs: string): string {
  return path.join(STATE_DIR, `${sanitizeKey(threadTs)}.json`);
}

export async function loadThread(threadTs: string): Promise<ThreadMessage[]> {
  try {
    const buf = await fs.readFile(filePathFor(threadTs), "utf-8");
    const state = JSON.parse(buf) as ThreadState;
    return state.messages ?? [];
  } catch {
    return [];
  }
}

export async function appendToThread(
  threadTs: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });

  const now = Date.now();
  const existing = await loadThread(threadTs);
  const updated = [
    ...existing,
    { role: "user" as const, content: userMessage, ts: now },
    { role: "assistant" as const, content: assistantMessage, ts: now },
  ].slice(-MAX_MSGS);

  const state: ThreadState = { messages: updated, lastUsed: now };
  await fs.writeFile(filePathFor(threadTs), JSON.stringify(state), "utf-8");
}

// 古い thread を物理削除（起動時 / 定期的に呼ぶ）
export async function pruneOldThreads(): Promise<number> {
  try {
    const entries = await fs.readdir(STATE_DIR);
    const now = Date.now();
    let removed = 0;
    for (const f of entries) {
      if (!f.endsWith(".json")) continue;
      const full = path.join(STATE_DIR, f);
      try {
        const buf = await fs.readFile(full, "utf-8");
        const state = JSON.parse(buf) as ThreadState;
        if (now - (state.lastUsed ?? 0) > MAX_AGE_MS) {
          await fs.unlink(full);
          removed++;
        }
      } catch {
        // 壊れたファイルは消す
        await fs.unlink(full);
        removed++;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}
