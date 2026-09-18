# cf-network-monitor

零成本、Cloudflare 免费层优先的全球网络连通性测试与监控系统。

## 重要声明（请先读）

1. **Cloudflare Edge Location ≠ 真实出口国家**。Cloudflare Workers 免费层无法指定某个请求从哪个国家的 PoP 发出，本项目不伪造或声称拥有日本/新加坡/美国等十国的 Cloudflare 出口节点。
2. 项目中的“目标”指你自己拥有的服务器/网站，不是任意第三方 URL，系统内置 SSRF 防护，不支持任意 URL 转发，**不能作为开放代理使用**。
3. 真实的十国（JP/SG/US/DE/GB/CA/AU/KR/HK/TW）网络测量数据来自 [RIPE Atlas](https://atlas.ripe.net)，一个免费、合法的全球互联网测量网络，不是 Cloudflare 产品。
4. 本地探测（`src/services/probe.service.ts`）受 Workers 运行时限制，**无法拆分 DNS 解析时间与 TLS 握手时间**，这两项在数据库中永远为 `null`，不伪造数据。

## 架构

```
用户/浏览器
   ↓ HTTPS
Cloudflare DNS (你的域名)
   ↓
Cloudflare Edge (Anycast)
   ↓
Cloudflare Worker (src/index.ts)
   ├─ Cron Trigger → probe.service.ts → D1 (probe_results / target_state)
   ├─ /api/ping /api/targets /api/history → D1 查询 + 评分
   └─ RIPE Atlas API → ripe_measurements（真实多国数据）
   ↓
Cloudflare Pages (src/dashboard/public) — 静态 Dashboard 前端
```

## 目录结构

```
src/
├─ index.ts              Worker 主入口（路由 + CORS + Cron）
├─ api/                  HTTP 路由处理器
├─ services/             业务逻辑（探测、评分、RIPE Atlas、目标管理）
├─ utils/                通用工具（D1、日志、鉴权、限流、SSRF 防护）
├─ types/                全局类型定义
└─ dashboard/public/     静态 Dashboard 前端（部署到 Cloudflare Pages）
migrations/
└─ 0001_init.sql         D1 表结构
```

## 从零部署（所有命令可直接复制）

### 0. 前置检查

```bash
node -v          # 建议 18+
npm -v
npx wrangler --version
```

### 1. 安装依赖与登录 Cloudflare

```bash
git clone https://github.com/original0211/cf-network-monitor.git
cd cf-network-monitor
npm install
npx wrangler login
```

### 2. 创建 D1 数据库（免费额度内）

```bash
npx wrangler d1 create monitor_db
```

命令输出会给你一个 `database_id`，把它填入 `wrangler.toml` 中 `[[d1_databases]]` 的 `database_id` 字段。

### 3. 创建 KV 命名空间

```bash
npx wrangler kv namespace create STATUS_KV
```

把返回的 `id` 填入 `wrangler.toml` 中 `[[kv_namespaces]]` 的 `id` 字段。

### 4. 执行数据库迁移

```bash
npm run db:migrate:local   # 先本地验证
npm run db:migrate:remote  # 确认无误后再执行远程
```

### 5. 注入敏感变量（不要写在 wrangler.toml 里）

```bash
npx wrangler secret put ADMIN_TOKEN
# 提示时输入一个至少 32 位的随机字符串，可用： openssl rand -hex 32

npx wrangler secret put RIPE_ATLAS_API_KEY
# 输入你在 https://atlas.ripe.net 已申请的 API Key
```

### 6. 本地测试

```bash
npm run typecheck
npm test
npm run dev
# 在另一个终端窗口：
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/api/ping
```

### 7. 部署 Worker

```bash
npm run deploy
```

### 8. 部署 Dashboard（Cloudflare Pages）

```bash
npm run pages:deploy
```

首次部署会提示创建 Pages 项目，按提示选择账户即可。

### 9. 绑定域名（Cloudflare Dashboard 控制台操作）

1. 在 Workers & Pages → 你的 Worker → Settings → Triggers → Custom Domains 中添加 `api.brodydung.eu.org`，或取消 `wrangler.toml` 中 `routes` 的注释并重新 `npm run deploy`。
2. 在 Pages 项目的 Custom Domains 中添加 `www.brodydung.eu.org`、`monitor.brodydung.eu.org`、`status.brodydung.eu.org`（根据你的需要拆分或合并）。
3. DNS 记录会由 Cloudflare 自动创建，保持橘云（代理开启）状态。

### 10. 验证

```bash
curl https://api.brodydung.eu.org/healthz
curl https://api.brodydung.eu.org/api/ping
curl -X POST https://api.brodydung.eu.org/api/probe/run \
  -H "authorization: Bearer <你的 ADMIN_TOKEN>"
```

## 添加监控目标

```bash
curl -X POST https://api.brodydung.eu.org/api/targets \
  -H "authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"id":"www","name":"Dashboard 前端","url":"https://www.brodydung.eu.org","region_label":"self-hosted"}'
```

## 安全设计清单

- HTTPS：Cloudflare 免费 Universal SSL 默认开启
- 鉴权：`ADMIN_TOKEN` + 带时序安全比较（`src/utils/auth.ts`）
- 限流：基于 KV 的固定窗口限流（`src/utils/rate-limit.ts`）
- CORS：仅允许 `ALLOWED_ORIGINS` 白名单中的前端源
- 输入校验：目标 ID 正则白名单、长度限制（`src/api/targets.ts`）
- 防 SSRF / 防开放代理：
  - 所有探测目标必须预先存在 D1 `targets` 白名单
  - 全局拦截任何请求中的 `url`/`target_url`/`endpoint` 参数（`src/index.ts`）
  - 拒绝内网/回环/非 http(s) 协议的 URL（`src/utils/ssrf-guard.ts`）
- 日志：结构化 JSON 日志，可通过 `npx wrangler tail` 实时查看

## 测试

```bash
npm test          # vitest 单元测试（评分算法 + SSRF 防护）
npm run typecheck # TypeScript 类型检查
```

## 免费额度与限制说明

Cloudflare 各产品免费额度（Workers 请求数、D1 存储/读写、KV 读写、Cron Triggers 数量）会随时间调整，请以你登录 [Cloudflare Dashboard](https://dash.cloudflare.com) 后在 Workers & Pages 页面看到的实时额度为准，本文档不硬编码具体数字以免过时。RIPE Atlas 的测量信用点同理，请以你的 [RIPE Atlas 账户页面](https://atlas.ripe.net/) 为准。

## 后续优化方向

- 给 `/api/probe/run` 增加 IP 白名单选项，进一步收紧手动测速权限
- 将 RIPE Atlas 结果拉取改为独立的定时 Worker（降低主 Worker 负载）
- 引入 Cloudflare Access（Zero Trust 免费层）保护 monitor.brodydung.eu.org，取代纯 Token 方案
- 增加邮件/Webhook 告警（目标连续失败达到阈值时通知）
