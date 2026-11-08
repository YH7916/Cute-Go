# 阿里云 Pi 后台部署

更新：2026-10-30。

- 前端：`https://yh7916.github.io/Cute-Go/`。
- 后台：`https://hutao.yesterhaze.codes/api/coach`。
- SSH：`ssh aliyun`；独立服务 `cute-go-coach.service`。
- HTTPS 复用服务器已有 Cloudflare Tunnel，转发至 `http://localhost:80`；Pi 只监听 `127.0.0.1:80`，没有新增公网监听。
- 独立 Node.js 22.23.4：`/opt/cute-go/node/bin/node`；保留系统 Node 18 及其他服务。
- 发布目录：`/opt/cute-go/releases/20261030-cors-errors`，`/opt/cute-go/current` 指向当前版本；上一版 `20261030-891184e` 保留供回退。

## 启动与运维

服务定义见 [`deploy/aliyun/cute-go-coach.service`](../deploy/aliyun/cute-go-coach.service)。使用专用非登录账号、只读系统目录、384 MiB 内存上限、失败自动重启及开机启动。低端口权限仅授予该服务。模型 key 由用户请求传入，不写入 unit、环境文件或前端构建。

```sh
ssh aliyun 'sudo systemctl status cute-go-coach --no-pager'
ssh aliyun 'sudo systemctl restart cute-go-coach'
ssh aliyun 'sudo journalctl -u cute-go-coach -n 30 --no-pager'
```

systemd 的 `WorkingDirectory` 使用当前发布链接，`ExecStart` 使用相对脚本路径 `dist-server/main.mjs`。不要改成通过 `current` 的绝对入口：Node 会解析主模块的真实路径，当前启动器的直接执行判断可能因此不成立，导致进程正常退出而不监听。

## 后续发布与回退

1. 使用 Node 22.19+ 执行 `npm ci`、`npm run check` 和 `git diff --check`。
2. 将 `dist-server/`、`package.json`、`package-lock.json` 上传至新的独立发布目录；用 `/opt/cute-go/node/bin` 置于 PATH 前端后运行 `npm ci --omit=dev --no-audit --no-fund`。
3. 发布文件保持 root 所有、服务账号可读。记录旧 `current` 指向，再原子替换链接并重启服务；保留旧目录供回退。
4. 修改服务定义时先执行 `systemd-analyze verify`，再安装 unit 并 `systemctl daemon-reload`。
5. 验证本机监听、公网 HTTPS 及 CORS。失败时将 `current` 恢复至已记录的旧目录并重启。

前端 Quality 工作流读取 GitHub 仓库变量 `VITE_COACH_ENDPOINT`，值为上述完整后台地址；两端检查通过后再部署 Pages。这个变量是公开 URL，不是密钥。后台版本通过 SSH 单独发布，推送 GitHub 不会自动改动服务器。

## 部署验证及边界

本次已观察到：systemd 为 active/running，绑定 `127.0.0.1:80`；公网允许来源的 OPTIONS 返回 204，携带 `Access-Control-Allow-Origin: https://yh7916.github.io`；无 key 的 POST 返回 401，其他来源返回 403；服务器可直连 DeepSeek API，未鉴权访问返回 401。

公网代理曾将应用的 502 替换成无 CORS 头的错误页。回归先复现前后端契约失败，再将已处理执行错误改为 424；原超时取消、并发占位和脱敏断言保留。全量 1417 项测试通过。从真实 GitHub Pages 页面发起的无 key 请求返回可读 401 JSON，合成无效 key 请求经 Pi 返回可读 424 `upstream_error` JSON；服务无重启。该合成 key 不产生有效模型生成或付费调用。

这些检查证明部署、HTTPS、跨域和鉴权边界，不证明有效 key 的模型生成。本轮未使用真实付费 key 发起讲解；其他服务商的可达性与模型兼容性仍须分别验收。当前模型接入范围和并发/超时限制见 [Pi 后台文档](pi-coach-backend.md)。
