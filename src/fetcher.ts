import { request } from "undici";
import { FETCH_TIMEOUT_MS, USER_AGENT } from "../config/sources.ts";
import { isAllowed } from "./robots.ts";

export async function fetchText(url: string): Promise<string> {
  const allowed = await isAllowed(url);
  if (!allowed) {
    throw new Error(`robots.txt disallows: ${url}`);
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await request(url, {
        method: "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "ja,en;q=0.8",
        },
        headersTimeout: FETCH_TIMEOUT_MS,
        bodyTimeout: FETCH_TIMEOUT_MS,
      });
      if (res.statusCode >= 400) {
        throw new Error(`HTTP ${res.statusCode} for ${url}`);
      }
      return await res.body.text();
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
