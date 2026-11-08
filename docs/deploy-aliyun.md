# 阿里云 Pi 后台部署

更新：2026-11-08。

当前网页使用 GitHub Pages。原 `yesterhaze.codes` 域名已到期，旧公网讲解地址停用；后台改用阿里云公网 IP 和受信任的 Let's Encrypt IP 证书，无需续费域名。GitHub 仓库变量已更新；网页新版仍须通过 GitHub Actions 后才能上线，当前账户账单锁定阻止了 CI 启动。

- 前端：`https://yh7916.github.io/Cute-Go/`。
- 当前后台：`https://39.104.59.160/api/coach`；仅允许 `https://yh7916.github.io` 浏览器来源。
- 旧后台地址：`https://hutao.yesterhaze.codes/api/coach`（已停用，勿再作为构建默认值）。
- SSH：`ssh aliyun`；独立服务 `cute-go-coach.service`。
- HTTPS 入口：独立 `cute-go-https.service`，Caddy 2.11.9 监听公网 443，仅将 `/api/coach` 转发至 `127.0.0.1:80`；其他路径返回 404。Pi 继续只监听回环地址。
- 独立 Node.js 22.23.4：`/opt/cute-go/node/bin/node`；保留系统 Node 18 及其他服务。
- 发布目录：`/opt/cute-go/releases/20261030-cors-errors`，`/opt/cute-go/current` 指向当前版本；上一版 `20261030-891184e` 保留供回退。

## 启动与运维

服务定义见 [`deploy/aliyun/cute-go-coach.service`](../deploy/aliyun/cute-go-coach.service)。使用专用非登录账号、只读系统目录、384 MiB 内存上限、失败自动重启及开机启动。低端口权限仅授予该服务。模型 key 由用户请求传入，不写入 unit、环境文件或前端构建。

```sh
ssh aliyun 'sudo systemctl status cute-go-coach --no-pager'
ssh aliyun 'sudo systemctl restart cute-go-coach'
ssh aliyun 'sudo journalctl -u cute-go-coach -n 30 --no-pager'
ssh aliyun 'sudo systemctl status cute-go-https --no-pager'
ssh aliyun 'sudo journalctl -u cute-go-https -n 30 --no-pager'
```

systemd 的 `WorkingDirectory` 使用当前发布链接，`ExecStart` 使用相对脚本路径 `dist-server/main.mjs`。不要改成通过 `current` 的绝对入口：Node 会解析主模块的真实路径，当前启动器的直接执行判断可能因此不成立，导致进程正常退出而不监听。

## 无域名 HTTPS

配置使用 [`Caddyfile`](../deploy/aliyun/Caddyfile) 和 [`cute-go-https.service`](../deploy/aliyun/cute-go-https.service)。官方 Caddy 2.11.9 Linux amd64 包已按发布校验文件验证 SHA-512；二进制位于 `/opt/cute-go/caddy/caddy`，配置位于 `/etc/cute-go/Caddyfile`。独立动态账号、128 MiB 内存上限、开机启动；证书及 ACME 状态持久保存在 `/var/lib/cute-go-https`，不提交 Git。

证书使用 Let's Encrypt `shortlived` 配置和 TLS-ALPN-01 验证，Caddy 自动续期；已取得的 IP 证书约六天有效，不能把它当作长期静态证书。续期要求公网 TCP 443 持续可达，且服务器通过已有 `127.0.0.1:7890` 代理访问 ACME 服务。HTTP 80 仍留给原后台，不新增公网 HTTP 入口。`default_sni` 使不发送 SNI 的 IP 客户端也能选中正确证书；不使用自签名证书或关闭客户端校验。

修改时先运行 `COACH_PUBLIC_IP=39.104.59.160 /opt/cute-go/caddy/caddy validate --config /etc/cute-go/Caddyfile --adapter caddyfile`，再 `systemctl reload cute-go-https`。公网 IP 变更时同时修改 unit 的 `COACH_PUBLIC_IP`、`NO_PROXY` 和 GitHub 仓库变量，验证新证书后重建前端。回退 HTTPS 入口可停止并禁用 `cute-go-https`，原 Node 后台与其他服务不受影响；这会中断公网讲解。

## 后续发布与回退

1. 使用 Node 22.19+ 执行 `npm ci`、`npm run check` 和 `git diff --check`。
2. 将 `dist-server/`、`package.json`、`package-lock.json` 上传至新的独立发布目录；用 `/opt/cute-go/node/bin` 置于 PATH 前端后运行 `npm ci --omit=dev --no-audit --no-fund`。
3. 发布文件保持 root 所有、服务账号可读。记录旧 `current` 指向，再原子替换链接并重启服务；保留旧目录供回退。
4. 修改服务定义时先执行 `systemd-analyze verify`，再安装 unit 并 `systemctl daemon-reload`。
5. 验证本机监听、公网 HTTPS 及 CORS。失败时将 `current` 恢复至已记录的旧目录并重启。

前端 Quality 工作流读取 GitHub 仓库变量 `VITE_COACH_ENDPOINT=https://39.104.59.160/api/coach`，两端检查通过后部署 Pages。未设置时使用本地讲解。这个变量是公开 URL，不是密钥。后台版本通过 SSH 单独发布，推送 GitHub 不会自动改动服务器。旧用户保存的过期后台地址及其密钥会在新版启动时清除，其他自定义地址保留；玩家重新输入自己的模型 key。

## 部署验证及边界

2026-11-08：Node 和 HTTPS 两个服务均 active/running；新公网 IP 证书的 SAN、信任链及主机匹配校验通过。公网允许来源的 OPTIONS 返回 204，携带 `Access-Control-Allow-Origin: https://yh7916.github.io`；无 key 的 POST 返回 401，其他来源返回 403；从真实 GitHub Pages 页面通过 Chrome 发起跨域请求得到可读 401 JSON。证书维护已启用，本轮尚未跨越一个自动续期周期。

历史 Tunnel 验收：公网代理曾将应用的 502 替换成无 CORS 头的错误页。回归先复现前后端契约失败，再将已处理执行错误改为 424；原超时取消、并发占位和脱敏断言保留。当时全量 1417 项测试通过；合成无效 key 请求经 Pi 返回可读 424 `upstream_error` JSON，该合成 key 不产生有效模型生成或付费调用。

这些检查证明部署、HTTPS、跨域和鉴权边界，不证明有效 key 的模型生成。本轮未使用真实付费 key 发起讲解；其他服务商的可达性与模型兼容性仍须分别验收。当前模型接入范围和并发/超时限制见 [Pi 后台文档](pi-coach-backend.md)。
