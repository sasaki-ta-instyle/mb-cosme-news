import { WebClient } from "@slack/web-api";
import type { Block, KnownBlock } from "@slack/web-api";
import type { ScoredArticle } from "./types.ts";

type AnyBlock = Block | KnownBlock;

export function buildSlackBlocks(
  articles: ScoredArticle[],
  date: Date = new Date(),
): {
  text: string;
  blocks: AnyBlock[];
} {
  const dateLabel = formatDate(date);
  const header = `📰 化粧品ニュース朝報  ${dateLabel}  全 ${articles.length} 件`;

  if (articles.length === 0) {
    return {
      text: `${header}\n本日はメビウス文脈で拾うべきニュースはありませんでした。`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: header, emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "本日はメビウス文脈で拾うべきニュースはありませんでした。",
          },
        },
      ],
    };
  }

  const blocks: AnyBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: header, emoji: true },
    },
    { type: "divider" },
  ];

  let plainText = `${header}\n\n`;

  articles.forEach((a, i) => {
    const idx = i + 1;
    const lines = [
      `*${idx}. [${a.sourceName}] ${escapeSlack(a.title)}*`,
      escapeSlack(a.summary),
      `💡 ${escapeSlack(a.whyForMebius)}`,
      `🔗 <${a.canonicalUrl}|記事を開く>`,
    ];
    const mrkdwn = lines.join("\n");

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: mrkdwn },
    });

    plainText +=
      `${idx}. [${a.sourceName}] ${a.title}\n` +
      `   ${a.summary}\n` +
      `   💡 ${a.whyForMebius}\n` +
      `   ${a.canonicalUrl}\n\n`;
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          "ソース: WWD JAPAN / FASHIONSNAP / PR TIMES / 美的 / VOCE  ·  毎営業日 09:05 JST",
      },
    ],
  });

  return { text: plainText.trim(), blocks };
}

function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(d: Date): string {
  const tokyo = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = tokyo.getFullYear();
  const m = String(tokyo.getMonth() + 1).padStart(2, "0");
  const day = String(tokyo.getDate()).padStart(2, "0");
  const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyo.getDay()];
  return `${y}-${m}-${day} (${dow})`;
}

export async function postToSlack(
  articles: ScoredArticle[],
  channel: string,
  token: string,
): Promise<void> {
  const client = new WebClient(token);
  const { text, blocks } = buildSlackBlocks(articles);
  await client.chat.postMessage({
    channel,
    text,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  });
}
