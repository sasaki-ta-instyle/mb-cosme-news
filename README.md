# mb-cosme-news

化粧品ニュースを毎営業日朝に Slack へ配信する bot。メビウス製薬の商品企画・開発・マーケ・PR 担当向け。

## 概要

- **配信**: 平日 09:50 JST（ConoHa crontab → GitHub workflow_dispatch。土日 / 日本の祝日 / 年末年始 12/29〜1/3 は自動スキップ）
- **件数**: 1 投稿に 5〜8 件のダイジェスト
- **ソース**: WWD JAPAN / FASHIONSNAP / PR TIMES（ビューティー）/ @cosme for BUSINESS（column + case + info）/ 美的 / VOCE / 商業界（通販化粧品メーカー cat19）
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

- `.github/workflows/daily.yml` — `workflow_dispatch` 専用（schedule trigger は実測 4 時間遅延のため 2026-06-26 廃止。発火源は ConoHa crontab 経由の外部 cron。詳細は `docs/external-cron.md`）
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

## Bot custom tools（応答モード）

Slack「@シロコ」の質問応答は Claude Sonnet + 以下 4 つの custom tool + built-in web_search で動く（`src/bot/tools.ts`）。

| ツール | 用途 | 呼び先 |
|---|---|---|
| `read_trends_log` | 朝のダイジェスト由来のトレンド事例ログ（ローカル `state/trends/`） | ローカル file |
| `shiroco_search` | 業界書 27 冊 + JAPAL 通知の意味検索 | shiroco v2 `/api/search` |
| `search_japal_notices` | JAPAL 通知に絞った校閲・校正専用検索 | shiroco v2 `/api/japal/search` |
| `shiroco_compare` | **比較検証モード**: 業界平均 × メビウス実数（BQ）× GDrive 実績シートの突合 | shiroco v2 `/api/compare` |

`shiroco_compare` は業界平均だけでは足りず **メビウス実データとの突合が必要な質問**（「LTV は業界と比べて高い？」等）で発火。応答は 4 セクション固定（業界平均 / メビウス実数 / 差分 / 引き出せる問い）。BQ が未設定 or 未認証の場合は自動で「業界平均のみモード」に落ち、notes に理由を出す。

## 設計の根拠

`~/.claude/plans/slackbot-wwd-fashionsnap-prtimes-velvet-peach.md` に詳細プランを残してある。
比較検証モード追加は `~/.claude/plans/shiroco-sorted-bentley.md`（Phase C）。
