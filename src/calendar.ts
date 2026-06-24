// 日本の営業日判定（土日 / 祝日 / 年末年始の除外）。
// cron は平日のみ起動する（`* * * 1-5`）が、平日に祝日が当たる場合 + 年末年始は別途スキップする。

import holiday_jp from "@holiday-jp/holiday_jp";

// 12/29 〜 1/3 を年末年始扱いで除外
function isYearEndOrNewYear(d: Date): boolean {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return (m === 12 && day >= 29) || (m === 1 && day <= 3);
}

export interface SkipResult {
  skip: boolean;
  reason?: string;
}

export function shouldSkipToday(now: Date = new Date()): SkipResult {
  // JST に揃える（GitHub Actions の UTC で動いても日本時間で判定する）
  const tokyo = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const ymd = tokyo.toISOString().slice(0, 10);

  // 土日（cron 側でも除いているが二重防御）
  const dow = tokyo.getDay();
  if (dow === 0 || dow === 6) {
    return { skip: true, reason: `weekend (${ymd}, dow=${dow})` };
  }

  // 年末年始
  if (isYearEndOrNewYear(tokyo)) {
    return { skip: true, reason: `year-end / new year holiday (${ymd})` };
  }

  // 日本の祝日
  if (holiday_jp.isHoliday(tokyo)) {
    return { skip: true, reason: `Japanese national holiday (${ymd})` };
  }

  return { skip: false };
}
