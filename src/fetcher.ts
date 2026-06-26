import { request } from "undici";
import {
  FETCH_TIMEOUT_MS,
  USER_AGENT,
  FROM_HEADER,
} from "../config/sources.ts";
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
          from: FROM_HEADER,
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
      // Content-Type の charset を見て UTF-8 以外なら TextDecoder で変換。
      // @cosme は Shift_JIS で配信されていて、素直に .text() すると文字化けする。
      const buf = Buffer.from(await res.body.arrayBuffer());
      const ct = res.headers["content-type"];
      const ctStr = Array.isArray(ct) ? ct.join(",") : ct ?? "";
      const m = /charset=\s*"?([^";\s]+)/i.exec(ctStr);
      const rawCharset = (m?.[1] ?? "utf-8").toLowerCase();
      const charset = rawCharset === "sjis" || rawCharset === "shift-jis" ? "shift_jis" : rawCharset;
      try {
        return new TextDecoder(charset, { fatal: false }).decode(buf);
      } catch {
        // 未知の encoding ラベルなら UTF-8 で読む（既存挙動にフォールバック）
        return new TextDecoder("utf-8", { fatal: false }).decode(buf);
      }
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
