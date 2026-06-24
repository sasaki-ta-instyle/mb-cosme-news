# mb-cosme-news

化粧品ニュースを毎営業日朝に Slack へ配信する bot。メビウス製薬の商品企画・開発・マーケ・PR 担当向け。

## 概要

- **配信**: 平日 09:30 JST（GitHub Actions schedule）
- **件数**: 1 投稿に 5〜8 件のダイジェスト
- **ソース**: WWD JAPAN / FASHIONSNAP / PR TIMES（ビューティー）/ @cosme
- **選別**: キーワード一次フィルタ → Claude Haiku 4.5 で関連度判定 + 1〜2 行要約 + メビウス向け着眼点
- **重複排除**: 既配信 URL を `state/seen.json` で管理（commit-back）。同一プレスリリースの複数メディア横展開はタイトル類似度で 1 件に統合

## ローカル動作確認

```bash
pnpm install
cp .env.example .env
# .env に ANTHROPIC_API_KEY を入れる
DRY_RUN=true pnpm start   # Slack には投げず stdout に投稿プレビューを出す
```

## GitHub Actions

- `.github/workflows/daily.yml` — cron `30 0 * * 1-5`（UTC 月〜金 00:30 = JST 09:30）+ `workflow_dispatch`
- `.github/workflows/manual.yml` — 手動 `workflow_dispatch` 専用（`dry_run` フラグで切替可能）

## 必要な GitHub 設定

### Secrets
- `ANTHROPIC_API_KEY` — Claude Haiku 呼び出し
- `SLACK_BOT_TOKEN` — `xoxb-...`（`chat:write` スコープを持つ Slack App の Bot Token）

### Variables
- `SLACK_CHANNEL_ID` — 投稿先のチャンネル ID（`Cxxxx...`）
- `DRY_RUN` — 既定 `false`。`true` にすると本番 cron も投稿せず stdout のみ

## ファイル構成

```
src/
  index.ts            # 全体オーケストレーション
  sources/            # 各ソースの fetch + parse
    wwd.ts            # WWD JAPAN (scrape)
    fashionsnap.ts    # FASHIONSNAP (RSS)
    prtimes.ts        # PR TIMES (scrape)
    cosme.ts          # @cosme (scrape)
  normalize.ts        # URL canonical 化、HTML 除去、24-48h カットオフ
  dedupe.ts           # seen.json 突き合わせ + n-gram 類似度
  keyword-filter.ts   # 一次フィルタ
  llm.ts              # Claude バッチ呼び出し + zod 検証
  select.ts           # スコア閾値 + 採用件数調整
  slack.ts            # Block Kit ビルダー + chat.postMessage
  state.ts            # seen.json の読み書きと枝刈り
  robots.ts           # robots.txt 軽量チェック
config/
  sources.ts          # 各ソースの URL とパース設定
  keywords.ts         # 一次フィルタ辞書
  prompts.ts          # Claude 用 system / user テンプレ
state/
  seen.json           # commit-back される既配信 URL ハッシュ
docs/
  RESUMING.md         # 中断・再開・別 Mac 引き継ぎ手順
```

## 設計の根拠

`~/.claude/plans/slackbot-wwd-fashionsnap-prtimes-velvet-peach.md` に詳細プランを残してある。
