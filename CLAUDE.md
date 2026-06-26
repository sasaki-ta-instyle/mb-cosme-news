# mb-cosme-news

## このプロジェクトは何か

メビウス製薬の商品企画・開発・マーケ・PR チーム向けに、Slack 上で化粧品業界の情報サポートをする統合 bot。2 つの機能を持つ:

1. **朝のダイジェスト配信（v1 / cron）**: 平日 09:00 JST に WWD JAPAN / FASHIONSNAP / PR TIMES / 美的 / VOCE から記事を集め（@cosme は 2026-06-26 にサイト構造変化で一旦 disable）、メビウス文脈で関連度の高いものを最大 5 件、Slack の 1 投稿にまとめて流す。**発火は ConoHa crontab + `scripts/trigger-daily.sh` 経由で workflow_dispatch を叩く**（GitHub Actions の schedule trigger は実測 4 時間遅延のため 2026-06-26 廃止、詳細は `docs/external-cron.md`）。土日 / 日本の祝日 / 年末年始（12/29〜1/3）は `src/calendar.ts` の `shouldSkipToday()` で自動スキップ。手動で祝日でも配信したい時は `FORCE_RUN=true pnpm start:local`
2. **質問応答 bot「シロコ」（v2 / 常駐）**: `@シロコ` メンション or DM に対して、shiroco skill 由来の業界知識 + Web 検索で回答（ConoHa PM2 常駐 / Slack Socket Mode）

## 重要な事業文脈（Claude API への system prompt にも反映している）

- メビウス製薬 = スキンケアをコアとする化粧品ブランド。**健康食品は扱わない**
- 販路: D2C 自社通販 + Amazon + 楽天
- 商品開発: 企画・デザインは社内、製造は OEM 委託
- 関連度判定の評価軸: 商品企画ヒント / マーケトレンド / ランキング動向 / PR 施策 / オファー設計 / 薬機法

詳しくは `shiroco` skill と `~/.claude/learning/preferences/mebius-business-profile.md` を参照。

## 使うとき

### ダイジェスト配信 (v1)
- ローカル動作確認: `DRY_RUN=true pnpm start:local`
- 本番 cron は GitHub Actions に委譲。手動実行は `gh workflow run daily.yml --ref main`

### 質問応答 bot (v2)
- ローカル動作確認: `pnpm bot:local`（`.env` に `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `ANTHROPIC_API_KEY` が必要）
- 本番は ConoHa 上の PM2 で常駐。`scripts/deploy-bot.sh` または `gh workflow run deploy-bot.yml --ref main`
- Slack 側設定: Socket Mode + `xapp-...` の App-Level Token + `app_mention` / `message.im` の Event Subscriptions

## 編集時の注意

### ダイジェスト配信
- 出力フォーマット（Slack Block Kit）を変えるときは、必ず DRY_RUN で stdout プレビューを目視確認してから本番に出す
- `config/keywords.ts` のキーワードは粗いフィルタ。LLM 側で最終判定するので、ここで網羅性を上げすぎてもコストが増えるだけ
- `config/prompts.ts` の system prompt はメビウスの事業文脈を圧縮した素材になっている。変えるときは shiroco skill との整合を確認
- `state/seen.json` は cron 実行後に自動 commit-back される。手動編集しない

### 質問応答 bot
- `src/bot/persona.ts` の system prompt はシロコの persona。shiroco skill の素材から圧縮した版で、薬機法のグレーゾーン解釈・医療効果断定・未公開推測を断る指示を含む。変更時はこの抑止ガイドを残す
- `state/threads/*.json`（thread 単位の会話履歴）は git に絶対上げない（`.gitignore` 済み）。**PII を含む**
- Bot Token のスコープを変えたら **必ず Reinstall** → 新 `xoxb-...` を GitHub Secret に再登録

## このプロジェクトに関連する Workspace ルール（CLAUDE.md 上位）

- 命名: `mb-cosme-news` は `mb-` prefix = メビウス案件
- push 先: `sasaki-ta-instyle/mb-cosme-news`（public）
- author email: `sasaki-ta@instyle.group`
- 議論モード（円卓）: 内部 Slack 投稿のみで外向けブランド露出は無いため不要。要約文の質を見るときは editor agent を 1 度通す
