#!/usr/bin/env bash
# ConoHa 上で mb-cosme-news-bot を更新（git pull → pnpm install → pm2 reload）
# このスクリプトは ConoHa サーバ側（deploy ユーザー）で実行される。
# GitHub Actions deploy-bot.yml から ssh 経由で呼ばれる、もしくは手動でも実行可能。

set -euo pipefail

APP_NAME="_workers-mb-cosme-news-bot"
APP_DIR="/var/www/_workers/mb-cosme-news-bot"
REPO_URL="https://github.com/sasaki-ta-instyle/mb-cosme-news.git"
BRANCH="main"

echo "[deploy-bot] target: $APP_DIR"

# 初回 clone
if [ ! -d "$APP_DIR/.git" ]; then
  echo "[deploy-bot] first run: cloning..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# .env ファイル存在確認（中身は触らない）
ENV_FILE="/var/www/_shared/apps/_workers-mb-cosme-news-bot.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy-bot] ERROR: $ENV_FILE が無い。先に env ファイルを配置してください" >&2
  exit 1
fi

# 依存インストール
echo "[deploy-bot] pnpm install --prod=false ..."
pnpm install --frozen-lockfile

# logs ディレクトリ
mkdir -p logs

# PM2 起動 / リロード
echo "[deploy-bot] pm2 startOrReload ..."
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "[deploy-bot] done."
pm2 describe "$APP_NAME" | grep -E "status|uptime|pid" || true
