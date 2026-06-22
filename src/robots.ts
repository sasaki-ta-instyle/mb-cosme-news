import { request } from "undici";
import { USER_AGENT, FETCH_TIMEOUT_MS } from "../config/sources.ts";

interface RobotsRules {
  allow: string[];
  disallow: string[];
}

const cache = new Map<string, RobotsRules>();

async function fetchRobots(origin: string): Promise<RobotsRules> {
  const cached = cache.get(origin);
  if (cached) return cached;
  const url = `${origin}/robots.txt`;
  try {
    const res = await request(url, {
      method: "GET",
      headers: { "user-agent": USER_AGENT },
      headersTimeout: FETCH_TIMEOUT_MS,
      bodyTimeout: FETCH_TIMEOUT_MS,
    });
    if (res.statusCode >= 400) {
      const empty = { allow: [], disallow: [] };
      cache.set(origin, empty);
      return empty;
    }
    const text = await res.body.text();
    const rules = parseRobots(text);
    cache.set(origin, rules);
    return rules;
  } catch {
    const empty = { allow: [], disallow: [] };
    cache.set(origin, empty);
    return empty;
  }
}

function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const allow: string[] = [];
  const disallow: string[] = [];
  let activeForAll = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.+)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      activeForAll = value === "*";
      continue;
    }
    if (!activeForAll) continue;
    if (field === "allow" && value) allow.push(value);
    if (field === "disallow" && value) disallow.push(value);
  }
  return { allow, disallow };
}

export async function isAllowed(targetUrl: string): Promise<boolean> {
  try {
    const u = new URL(targetUrl);
    const origin = `${u.protocol}//${u.host}`;
    const path = u.pathname + u.search;
    const rules = await fetchRobots(origin);
    // 明示の disallow に prefix 一致したら不可。allow の方が長いなら許可
    let blocked = false;
    let blockedLen = 0;
    let allowedLen = 0;
    for (const d of rules.disallow) {
      if (path.startsWith(d)) {
        blocked = true;
        blockedLen = Math.max(blockedLen, d.length);
      }
    }
    for (const a of rules.allow) {
      if (path.startsWith(a)) {
        allowedLen = Math.max(allowedLen, a.length);
      }
    }
    if (!blocked) return true;
    return allowedLen >= blockedLen;
  } catch {
    return true;
  }
}
