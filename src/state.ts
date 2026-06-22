import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const STATE_PATH = path.resolve(process.cwd(), "state/seen.json");
const RETENTION_DAYS = 90;

export interface SeenEntry {
  firstSeenAt: string; // ISO
  sources: string[];
}

export type SeenMap = Record<string, SeenEntry>;

export async function loadSeen(): Promise<SeenMap> {
  if (!existsSync(STATE_PATH)) return {};
  try {
    const text = await readFile(STATE_PATH, "utf8");
    return JSON.parse(text) as SeenMap;
  } catch {
    return {};
  }
}

export async function saveSeen(map: SeenMap): Promise<void> {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
}

export function pruneOld(map: SeenMap, now: Date = new Date()): SeenMap {
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pruned: SeenMap = {};
  for (const [id, entry] of Object.entries(map)) {
    const t = Date.parse(entry.firstSeenAt);
    if (!Number.isNaN(t) && t >= cutoff) pruned[id] = entry;
  }
  return pruned;
}

export function recordDelivered(
  map: SeenMap,
  delivered: Array<{ id: string; source: string }>,
  now: Date = new Date(),
): SeenMap {
  const next = { ...map };
  for (const d of delivered) {
    const existing = next[d.id];
    if (existing) {
      if (!existing.sources.includes(d.source)) {
        existing.sources.push(d.source);
      }
    } else {
      next[d.id] = {
        firstSeenAt: now.toISOString(),
        sources: [d.source],
      };
    }
  }
  return next;
}
