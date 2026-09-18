#!/usr/bin/env bash
# scripts/deploy.sh
# 辅助部署脚本：引导你完成 D1/KV 创建、迁移、密钥注入与部署。
# 本脚本不会帮你自动修改 wrangler.toml，请按提示手动回填 ID。

set -euo pipefail

echo "==> 检查 wrangler 登录状态"
npx wrangler whoami || { echo "请先运行: npx wrangler login"; exit 1; }

echo "==> 安装依赖"
npm install

echo "==> 创建 D1 数据库（如已存在会报错，可忽略）"
npx wrangler d1 create monitor_db || true
echo "    请手动将上面输出的 database_id 填入 wrangler.toml"

echo "==> 创建 KV 命名空间（如已存在会报错，可忽略）"
npx wrangler kv namespace create STATUS_KV || true
echo "    请手动将上面输出的 id 填入 wrangler.toml"

read -p "已完成 wrangler.toml 中 database_id 与 kv id 的填写吗？(y/n) " confirmed
if [ "$confirmed" != "y" ]; then
  echo "请先完成配置再重新运行本脚本。"
  exit 1
fi

echo "==> 执行本地数据库迁移"
npm run db:migrate:local

read -p "本地迁移无误，是否执行远程迁移？(y/n) " remote_confirmed
if [ "$remote_confirmed" = "y" ]; then
  npm run db:migrate:remote
fi

echo "==> 检查敏感变量是否已注入（未注入则提示输入）"
npx wrangler secret list | grep -q ADMIN_TOKEN || npx wrangler secret put ADMIN_TOKEN
npx wrangler secret list | grep -q RIPE_ATLAS_API_KEY || npx wrangler secret put RIPE_ATLAS_API_KEY

echo "==> 类型检查与单测"
npm run typecheck
npm test

echo "==> 部署 Worker"
npm run deploy

echo "==> 部署 Dashboard (Cloudflare Pages)"
npm run pages:deploy

echo "==> 完成。请到 Cloudflare Dashboard 绑定自定义域名，然后运行："
echo "    curl https://api.brodydung.eu.org/healthz"
