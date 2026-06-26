#!/usr/bin/env bash
# ConoHa cron から GitHub Actions の daily.yml を workflow_dispatch で発火するスクリプト。
# GitHub Actions の schedule trigger は実測で 4 時間以上遅延することがあるため、
# 外部 cron (ConoHa) でタイミングを掌握する。発火そのものは GitHub Actions の
# runner で行うので、ConoHa 上に Node.js / 環境変数を持つ必要は無い。

set -euo pipefail

ENV_FILE="/var/www/_shared/apps/mb-cosme-news-trigger.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[trigger-daily] ERROR: $ENV_FILE が見つかりません" >&2
  exit 1
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

if [ -z "${GITHUB_PAT:-}" ]; then
  echo "[trigger-daily] ERROR: GITHUB_PAT が未設定" >&2
  exit 1
fi

REPO="sasaki-ta-instyle/mb-cosme-news"
WORKFLOW="daily.yml"
BRANCH="main"

# workflow_dispatch は 204 No Content を返す
HTTP_CODE=$(curl -sS -o /tmp/trigger-daily-resp.json -w "%{http_code}" \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches" \
  -d '{"ref":"'"$BRANCH"'"}')

NOW=$(date -u +%Y-%m-%dT%H:%MZ)
if [ "$HTTP_CODE" = "204" ]; then
  echo "[trigger-daily] $NOW dispatched ($HTTP_CODE)"
else
  echo "[trigger-daily] $NOW FAILED http=$HTTP_CODE body=$(cat /tmp/trigger-daily-resp.json)" >&2
  exit 1
fi
