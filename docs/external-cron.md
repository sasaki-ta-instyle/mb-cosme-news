# 外部 cron 運用（ConoHa → GitHub workflow_dispatch）

## 経緯

GitHub Actions の schedule trigger は実測で 4 時間以上遅延する（2026-06-26 観測:
JST 09:05 設定 → 実発火 JST 13:15）。朝のダイジェストとしては実用性が無いため、
schedule trigger を廃止し、**ConoHa の crontab から `scripts/trigger-daily.sh`
経由で `workflow_dispatch` を発火する** 運用に切り替えた。

発火そのものは GitHub Actions の runner で行う（state/seen.json + state/trends/
の commit-back 機構をそのまま使える）。ConoHa は cron で workflow_dispatch を
叩くだけなので、Node.js / 環境変数を持たない。

## 構成

```
ConoHa crontab (deploy user, TZ=Asia/Tokyo)
  └─ 毎平日 09:30 JST で trigger-daily.sh を実行
      └─ curl で POST /repos/.../actions/workflows/daily.yml/dispatches
          └─ GitHub Actions の daily.yml が即時発火（数秒以内）
              └─ pnpm start → Slack 投稿 → state commit-back
```

> **タイムゾーンの注意**: ConoHa の system TZ は `Asia/Tokyo`（`timedatectl` で確認できる）。crontab の時刻は **そのまま JST で書く**。UTC 換算しない。過去に `30 0 * * 1-5` を「UTC 00:30 = JST 09:30」のつもりで書いたところ、実際は **JST 00:30** に発火して深夜配信されてしまった事故がある（2026-06-29 検知）。

## セットアップ手順（初回のみ）

### 1. GitHub Fine-grained PAT を作成

1. https://github.com/settings/personal-access-tokens/new
2. **Token name**: `mb-cosme-news-trigger`
3. **Resource owner**: `sasaki-ta-instyle`
4. **Expiration**: 1 year（更新リマインダーをカレンダーに）
5. **Repository access**: Only select repositories → `sasaki-ta-instyle/mb-cosme-news`
6. **Permissions** → Repository permissions:
   - **Actions: Read and write**（これが必須）
   - その他は No access のままで OK
7. Generate → `github_pat_...` をコピー

### 2. ConoHa に PAT を配置

```bash
# root で env ファイルを deploy 所有・600 で作成
ssh conoha-root 'install -o deploy -g deploy -m 600 /dev/null /var/www/_shared/apps/mb-cosme-news-trigger.env'

# deploy で中身を書く（PAT をその場で渡す）
ssh conoha-deploy 'cat > /var/www/_shared/apps/mb-cosme-news-trigger.env <<EOF
GITHUB_PAT=github_pat_xxxxxxxxxxxxxxxx
EOF'

# 確認（値は出さない）
ssh conoha-deploy 'ls -la /var/www/_shared/apps/mb-cosme-news-trigger.env && grep -c GITHUB_PAT /var/www/_shared/apps/mb-cosme-news-trigger.env'
```

### 3. トリガースクリプトを手動テスト

**初回は必ず `--dry-run` で試す**（Slack に投稿せず動作確認）:

```bash
ssh conoha-deploy 'bash /var/www/_workers/mb-cosme-news-bot/scripts/trigger-daily.sh --dry-run'
# → [trigger-daily] YYYY-MM-DDTHH:MMZ dispatched dry_run=true (204)

# 1〜2 分後に GitHub Actions 側で run が起動したか確認（ローカルから）
gh run list --workflow=daily.yml --limit 3 --json event,createdAt --repo sasaki-ta-instyle/mb-cosme-news
# → event=workflow_dispatch の最新行があれば成功
```

LIVE 発火（Slack 投稿）でテストしたい場合は引数なし:

```bash
ssh conoha-deploy 'bash /var/www/_workers/mb-cosme-news-bot/scripts/trigger-daily.sh'
# → [trigger-daily] ... dispatched dry_run=false (204)
```

### 4. crontab に登録

```bash
ssh conoha-deploy 'crontab -e'
```

以下を追記（既存の cron 行はそのまま）:

```cron
# mb-cosme-news: 毎平日 JST 09:30 に GitHub Actions の daily.yml を発火（TZ=Asia/Tokyo なので JST 直書き）
# 祝日 / 年末年始は src/calendar.ts の shouldSkipToday() で配信前にスキップ
30 9 * * 1-5 bash /var/www/_workers/mb-cosme-news-bot/scripts/trigger-daily.sh >> /var/www/_workers/mb-cosme-news-bot/logs/trigger-daily.log 2>&1
```

`30 9 * * 1-5` = JST 09:30 月〜金（ConoHa TZ が Asia/Tokyo のため UTC 換算は不要）。

## 注意

- **PAT は repo 配下に絶対 commit しない**。`/var/www/_shared/apps/` 配下が正本
- **PAT の更新**: 期限切れ前に更新作業（GitHub で再発行 → ConoHa の env ファイル書き換え）。期限切れたら朝発火しなくなる
- **デプロイ時の上書きに注意**: `deploy-bot.sh` は `git reset --hard` するが、`scripts/trigger-daily.sh` も repo 配下なので更新と同時に最新版に置き換わる。`/var/www/_shared/apps/mb-cosme-news-trigger.env` は repo 外なので影響なし
- **手動発火は今後どこから？**: ローカルから `gh workflow run daily.yml --ref main` も従来通り使える。ConoHa cron はそれと並列に動く
- **障害時の切り戻し**: ConoHa cron を一時停止したい時は `crontab -e` で該当行をコメントアウト。GitHub Actions 側の schedule は廃止済みなので、発火源は完全に ConoHa に集約されている
