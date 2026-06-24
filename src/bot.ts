// mb-cosme-news bot エントリポイント。
// Slack Socket Mode で app_mention / message.im を受け、Claude API で応答する。

import { App, LogLevel } from "@slack/bolt";
import type {
  AllMiddlewareArgs,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import { answerQuestion } from "./bot/handler.ts";
import { pruneOldThreads } from "./bot/thread-memory.ts";

const botToken = process.env.SLACK_BOT_TOKEN;
const appToken = process.env.SLACK_APP_TOKEN;

if (!botToken) {
  console.error("[bot] SLACK_BOT_TOKEN is not set");
  process.exit(1);
}
if (!appToken) {
  console.error("[bot] SLACK_APP_TOKEN (xapp-...) is not set");
  process.exit(1);
}

const app = new App({
  token: botToken,
  appToken,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// チャンネルで @シロコ メンションされたとき
app.event<"app_mention">(
  "app_mention",
  async ({
    event,
    client,
    logger,
  }: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
    const userText = stripMention(event.text ?? "");
    const threadTs = event.thread_ts ?? event.ts;
    logger.info(`[mention] user=${event.user} text=${userText.slice(0, 80)}`);

    const reply = await answerQuestion({ userText, threadTs });
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: threadTs,
      text: reply,
      unfurl_links: false,
      unfurl_media: false,
    });
  },
);

// DM を受けたとき
app.event<"message">(
  "message",
  async ({
    event,
    client,
    logger,
  }: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
    // bot 自身の発話や、編集・削除イベントはスキップ
    if ("subtype" in event && event.subtype) return;
    if (!("user" in event) || !event.user) return;
    if (!("channel_type" in event) || event.channel_type !== "im") return;
    if (!("text" in event) || !event.text) return;

    const userText = event.text.trim();
    // DM の場合、thread_ts は通常無いが、有ればスレッド継続。なければ各メッセージは独立扱い
    // ここでは DM 全体を 1 thread として扱うため、channel id を thread key にする
    const threadTs =
      ("thread_ts" in event && event.thread_ts) || `dm-${event.channel}`;
    logger.info(`[dm] user=${event.user} text=${userText.slice(0, 80)}`);

    const reply = await answerQuestion({ userText, threadTs });
    await client.chat.postMessage({
      channel: event.channel,
      text: reply,
      unfurl_links: false,
      unfurl_media: false,
    });
  },
);

function stripMention(text: string): string {
  // "<@U12345> こんにちは" のような mention 部分を除去
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

(async () => {
  // 起動時に古い thread memory を掃除
  const removed = await pruneOldThreads();
  if (removed > 0) console.log(`[startup] pruned ${removed} old thread files`);

  await app.start();
  console.log("=== mb-cosme-news bot started (Socket Mode) ===");
})();
