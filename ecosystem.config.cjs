// PM2 起動定義（ConoHa 常駐用）。
// 質問応答 bot を Socket Mode で常時起動する。

module.exports = {
  apps: [
    {
      name: "_workers-mb-cosme-news-bot",
      // ConoHa では node --env-file=<shared-env> tsx-cli src/bot.ts で env をロード
      script: "node",
      args: "--env-file=/var/www/_shared/apps/_workers-mb-cosme-news-bot.env node_modules/tsx/dist/cli.mjs src/bot.ts",
      cwd: ".",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "logs/bot-out.log",
      error_file: "logs/bot-err.log",
      time: true,
    },
  ],
};
