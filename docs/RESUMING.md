# RESUMING — 中断・再開・別 Mac 引き継ぎ

## このプロジェクトの全体像

`README.md` と `CLAUDE.md` を最初に読む。詳細プランは `~/.claude/plans/slackbot-wwd-fashionsnap-prtimes-velvet-peach.md`。

## 別 Mac で立ち上げる

```bash
cd ~/Workspace
git clone git@github.com:sasaki-ta-instyle/mb-cosme-news.git
cd mb-cosme-news
pnpm install
cp .env.example .env
# .env を埋める
DRY_RUN=true pnpm start
```

## 本番（GitHub Actions）の状態確認

```bash
gh workflow list --repo sasaki-ta-instyle/mb-cosme-news
gh run list --workflow=daily.yml --repo sasaki-ta-instyle/mb-cosme-news --limit 5
gh run view <run-id> --log --repo sasaki-ta-instyle/mb-cosme-news
```

## 手動実行

```bash
# 本番投稿あり
gh workflow run daily.yml --ref main --repo sasaki-ta-instyle/mb-cosme-news

# dry-run（Slack に投げず、ログに投稿プレビューだけ出る）
gh workflow run manual.yml --ref main --repo sasaki-ta-instyle/mb-cosme-news -f dry_run=true
```

## ハマりどころ

- **cron が遅れる**: GitHub Actions の cron は混雑時に 30 分くらい遅延する。09:30 JST に来なくても 10:00 まで待つ
- **`state/seen.json` のコミットが衝突する**: 手動実行と cron が重なると push 競合する可能性。`workflow.yml` 側で `permissions: contents: write` と `concurrency` を設定済み
- **Slack 投稿が崩れる**: Block Kit の文字数制限（テキスト 3000 字、セクションあたり）。`src/slack.ts` は section ごとに分割する実装になっている
- **WWD / PR TIMES / @cosme の HTML 構造が変わる**: スクレイパー（`src/sources/*.ts`）の CSS selector が壊れたら、各ソースのページを開いて DOM を見て直す。fallback として「0 件取れたら警告を stderr に出して継続」する設計
- **Claude API のレート/コスト**: 1 営業日 1 リクエスト想定。バッチ JSON で返すので Haiku でも数百〜数千トークン程度

## チャンネル変更・追加

- 投稿先チャンネルを変えるとき: GitHub Variables の `SLACK_CHANNEL_ID` を更新
- スレッド分割や複数チャンネル運用が必要になったら `src/slack.ts` を拡張

## キーワード辞書の調整

`config/keywords.ts` を編集して PR。LLM 側で最終判定するので網羅性 > 厳密性。
