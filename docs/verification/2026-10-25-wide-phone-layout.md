# 宽竖屏对局布局（2026-10-25）

## 当前范围

用户选择第二张草图，并追加：只改布局、保留原 UI 组件；提子卡与左侧按钮同高；棋盘用可用全宽，接受下方半透明讲解覆盖并可滚动到达。

- 条件：`(min-width: 640px) and (orientation: portrait)`。展开宽手机和竖屏平板共用；窄手机、横屏、课堂维持原路径。
- 现有 TopBar 与 ScoreBoard 同处第一行，提子卡 51px，与左侧导航同高；现有形势面板和对局操作并排。无形势时，摆棋/复盘/对局操作跨整行。
- 仅重排现有节点，不复制 SVG、重写 UI 组件或改变业务逻辑。TopBar、ScoreBoard 源码本轮未改。
- 棋盘保留两侧各8px间距并使用全部可用宽度；半透明陪练沿用 sticky，内容过高允许纵向滚动。透明外层不拦截棋盘点击，人物和对话保留原交互。
- 根容器负责底部安全区，助手内部固定8px下间距，避免重复预留安全区挤出人物。

## 证据

- Fold6 原现场：1856×2160 物理像素、density420，`output/fold-layout/device-before.png`。此图属于修改前的 TapTap。
- 当前浏览器矩阵：640×640、640×800、707×823、768×1024、1024×1366；棋盘宽度等于内容区减16px，保持正方形；卡片与导航均51px，中心偏差不超过1px；形势/操作不相交。
- 707×823：可用内容宽697px（浏览器滚动条10px），棋盘681×681px；下滚后棋盘下沿在讲解区之上。首屏部分覆盖是用户明确要求，未再缩小棋盘来容纳讲解区。
- 390×844、600×800、639×900、823×707、844×390、1024×768：临时关闭本次媒体规则前后，实际布局几何一致；全部临时更改已恢复。
- 实际操作：设置切到19路、摆棋四角和中心落子、开始对局/停着/结算、复盘上一手和进度显示。无形势时控件跨整行。
- 边界夹具：三位提子数和长形势文案；夹具只验证布局，不代表真实对局结果。
- 最终生产构建截图：`output/playwright/selected-layout-final-707x823.png`、`selected-layout-final-768x1024.png`；浏览器无 console error。9路下滚后四角命中真实棋盘交点，见 `output/fold-layout/selected-final-corner-hit-tests.json`。
- 几何记录：`output/fold-layout/selected-full-width-metrics.json`、`selected-unaffected-metrics.json`。
- 早期 `selected-production-metrics.json`、`selected-check.log` 对应未采用的“缩小棋盘以全部显示”版本；以本报告及 `selected-final-check.log` 为准。

## 检查与限制

- 最终 `npm run check` exit 0：contracts → lint → typecheck → 1398/1398 tests → 前后端 build；`git diff --check` 通过。日志：`output/fold-layout/selected-final-check.log`。
- 已按用户授权上传开发测试包，尚未进行 TapTap X5 原生容器验收。
- 浏览器操作不等于 Android 真机触摸、安全区或多指缩放验收；课堂布局没有纳入本次适配。


## 开发测试包上传

2026-10-25，用户明确授权上传供手机自测。官方 CLI doctor、归档预检均通过，无归档警告；未重新构建，包内容来自上述已通过检查的 dist。

- 应用：CuteGo H5，app809520 / developer376133。
- 文件：`output/fold-layout/CuteGo-wide-portrait-layout-20261025-h5.zip`，29,556,934字节；单根目录dist，入口dist/index.html。
- SHA256：`336aae2eda0b4f132a982f4e2b16127bfd820c563afc3f26630bf238dc04521e`。
- 上传成功：H5版本365875，包记录117413；远端列表已确认文件名/大小/竖屏方向一致，is_releasing=false。
- 测试二维码：`output/fold-layout/CuteGo-wide-portrait-layout-20261025-test-qr.png`，指向develop版本365875。
- 当前线上仍为263077；没有绑定主包、提审或发布。
- 证据：本目录对应的 `output/fold-layout/taptap-upload-preview.json`、`taptap-upload-result.json`、`taptap-packages-after.json`、`taptap-test-entry.json`。


## 正式版草稿准备

2026-10-25，用户要求“直接传正式版”。已读取可编辑草稿V-20261019、ready候选和主槽位原始expected，执行dry-run后绑定H5版本365875；写后读取主槽位确认一致。当前资料分析未返回阻塞或警告，Android/iOS/PC分发入口均为“提供游玩”，未改动分发设置。

尚未调用审核快照、预检或提交；按taptap-app-edit技能的明确提审确认门槛等待用户确认。线上H5仍为263077，365875仍未发布。后续提审须以最新审核快照与预检结果复核，不能把资料分析空阻塞当作正式预检通过。

证据：`release-binding-result.json`、`release-packages-after.json`、`release-status-after.json`、`release-h5-after.json`，均位于`output/fold-layout/`。


## 正式提审结果

2026-10-25，用户明确确认“保留原名，直接提审，审核通过后立即上线”。内容预审无阻塞项，唯一警告为社群名与游戏关联性；用户已知晓并选择保留“Yohaku的粉丝群~”，没有执行群名修改预案。

- 提交前再次读取并确认版本1105373（V-20261019）、主包365875、原社群名以及Android/iOS/PC“提供游玩”状态没有漂移。
- 使用与预检完全相同的 `release_schedule.kind=immediate`，稳定幂等键 `cutego-submit-1105373-365875-immediate-20261025` 提交一次，服务端受理成功。
- 审核单1105373；版本详情读回 `reviewing`，新增 `review_submitted` 事件。当前是审核中，不能表述为已经上线。
- 发布设置模块未单独回显档期字段；“按过审后立即上线提交”的证据是已受理的提交输入，不据空字段推断其他发布状态。
- 下一步等待TapTap审核结果，收到审核结果后可查询版本详情；本轮未创建自动轮询或再次提交任务。
- 证据：`submit-review-result.json`、`submit-version-after.json`、`submit-platform-after.json`、`submit-release-settings-after.json`，均位于`output/fold-layout/`。

## 重新编译并替换正式审核包

2026-10-25，用户要求“重新编译包然后上传，然后提交正式”，沿用已确认的“保留原名，审核通过后立即上线”。本次重新执行 npm run check，并以新 dist 打包，没有复用上次 ZIP。

- 全量检查 exit 0：contracts → lint → typecheck → 1415/1415 tests → 前端与 Node 后台 build；git diff --check 通过。
- H5 ZIP 仅包含前端 dist，不含 dist-server。入口为 index-DbH5YaU8.js / index-WaBYLHCL.css，宽竖屏布局规则保持。
- 新文件：output/taptap-rebuild-20261025-142950/CuteGo-rebuild-20261025-142950-h5.zip；29,520,485 字节，47 个文件，单根 dist/，入口 dist/index.html。
- SHA256：d53e4c499470c047ce0547c88730d6ace2a244089b0731deb76593cb82cf516b。每个 ZIP 条目的字节数和 SHA256 已对照 manifest 校验；Windows 末尾句点的两个 LICENSE 文件用扩展路径读取并保留原名。
- 官方 CLI 归档预检无错误、无警告；新 H5 版本 366074，包记录 117540，远端文件名/大小/竖屏方向与本地一致。
- 新包上传成功后撤回上次审核，版本 1105373 回到 draft；读取最新主槽位 expected 后绑定 366074，写后及提审后均读回一致。
- 内容预检首次网络传输失败，保留失败响应；只读重试通过，阻塞项和警告均为空。原群名仍为“Yohaku的粉丝群~”；Android/iOS/PC 分发仍为“提供游玩”。
- 同一版本 1105373（V-20261019）使用与预检相同的 release_schedule.kind=immediate 提交，幂等键 cutego-submit-1105373-366074-immediate-20261025；正式受理成功，审核单 1105373。
- 版本详情读回 reviewing，新增 review_submitted 事件时间戳 1792910075，晚于本次 review_withdrawn 1792909953。当前是新包审核中，尚未上线；发布设置模块未单独回显档期，以已受理的 immediate 输入为设置证据。
- 本轮没有修改产品代码，没有重新进行 TapTap 原生真机验收，也没有提交或推送 Git。

证据均在 output/taptap-rebuild-20261025-142950/：check.log、package-manifest.json、materials-inspect.json、upload-preview.json、upload-result.json、h5-after-upload.json、withdraw-result.json、version-after-withdraw.json、bind-result.json、packages-after-bind.json、review-snapshot.json、review-precheck.json（首次网络失败）、review-precheck-retry.json（通过）、submit-preview.json、submit-result.json、version-after-submit.json、packages-after-submit.json、release-settings-after-submit.json。
