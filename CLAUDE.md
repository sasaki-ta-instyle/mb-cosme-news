# mb-cosme-news

## このプロジェクトは何か

化粧品ニュースを毎営業日朝に Slack へ配信する bot。メビウス製薬の商品企画・開発・マーケ・PR チーム向け。GitHub Actions cron で平日 09:00 JST に起動し、WWD JAPAN / FASHIONSNAP / PR TIMES / @cosme から記事を集めて、メビウス文脈で関連度の高いものを 5〜8 件、Slack の 1 投稿にまとめて流す。

## 重要な事業文脈（Claude API への system prompt にも反映している）

- メビウス製薬 = スキンケアをコアとする化粧品ブランド。**健康食品は扱わない**
- 販路: D2C 自社通販 + Amazon + 楽天
- 商品開発: 企画・デザインは社内、製造は OEM 委託
- 関連度判定の評価軸: 商品企画ヒント / マーケトレンド / ランキング動向 / PR 施策 / オファー設計 / 薬機法

詳しくは `shiroco` skill と `~/.claude/learning/preferences/mebius-business-profile.md` を参照。

## 使うとき

- ローカル動作確認: `DRY_RUN=true pnpm start`
- 本番 cron は GitHub Actions に委譲。手動実行は `gh workflow run daily.yml --ref main`

## 編集時の注意

- 出力フォーマット（Slack Block Kit）を変えるときは、必ず DRY_RUN で stdout プレビューを目視確認してから本番に出す
- `config/keywords.ts` のキーワードは粗いフィルタ。LLM 側で最終判定するので、ここで網羅性を上げすぎてもコストが増えるだけ
- `config/prompts.ts` の system prompt はメビウスの事業文脈を圧縮した素材になっている。変えるときは shiroco skill との整合を確認
- `state/seen.json` は cron 実行後に自動 commit-back される。手動編集しない

## このプロジェクトに関連する Workspace ルール（CLAUDE.md 上位）

- 命名: `mb-cosme-news` は `mb-` prefix = メビウス案件
- push 先: `sasaki-ta-instyle/mb-cosme-news`（public）
- author email: `sasaki-ta@instyle.group`
- 議論モード（円卓）: 内部 Slack 投稿のみで外向けブランド露出は無いため不要。要約文の質を見るときは editor agent を 1 度通す
