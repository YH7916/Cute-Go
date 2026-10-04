# 互动教学验收 · 2026-10-03

范围：将进阶教学主目录切换为固定来源课程，打通原题应手、自由试下、同题示范与恢复，并精简人物讲解。保留工作区已有改动；未提交、推送或发布。

## 交付内容

- 29 课、114 步：OGS 25 课/98 页，Go Game Guru 4 课/16 题。旧自编题退出主目录，保留为规则测试和有限通用概念材料。
- 原题棋盘、执子、标记及答案树保留。明确正确节点才过关；未知合法分支允许继续试下，复用已有启蒙 AI 应手，不计答对。
- 同题示范逐手展示，返回恢复原答案、选项、标记及完整棋局；换题、重置、退出和 owner 切换使旧回调失效。
- 终局支持停一手、整块选择死子、确认与结束，遵守原题“地盘＋提子”的数目法。
- 任务默认一句话；讲解使用短要点和无序列表；提示替换旧讲解，不重复堆叠。复用木色棋盘、角色气泡与现有圆角按钮。
- 署名、许可及来源说明集中在关于致谢。软件 AGPL-3.0-or-later，GGG 内容 CC BY-NC-SA 4.0，其他资源依各自许可。

## 自动检查

`npm run check` 退出码 0：contracts → lint → typecheck → test → build 全部通过；**1018 项测试通过，0 失败、0 跳过**。日志：[`output/teaching-check.log`](../../output/teaching-check.log)。

关键回归：

- `ogs-learning-source.test.mjs`：注册顺序、基础页覆盖、坐标与原分支、翻译完整性、来源许可。
- `source-curriculum.test.mjs` / `source-exercise.test.mjs`：114 步实际适配与判题、动作题、非叶正确节点、解释性示范续着及未知分支。
- `source-learning.test.mjs` / `learning-practice-lifecycle.test.mjs`：应手、探索、撤回、示范还原、辅助记录、重进课程与旧回调隔离。
- `source-ko-history.test.mjs`：先复现缺少劫历史导致立即回提被允许；再验证原题明确上一手的还原、提子数、撤回、禁立即回提及正确劫材分支。
- `coach-bubble.test.mjs` / `learning-exercise-ui.test.mjs` / `source-learning-ui.test.mjs`：安全文本、换行、无序列表、提示替换与教学动作。

独立来源复核：

- `node scripts/import-ogs-learning.mjs --check` 通过。只读检查生成结果；官方注册 248 课/3551 页，选入 25 课/98 页。
- `node scripts/verify-go-game-guru.mjs` 通过。16 棵树、231 手全合法；独立 SGF 解析器确认所有原属性和分支保留，28 个明确正确节点、2 个明确错误节点、57 个未知叶保持未知。
- `git diff --check` 通过。

构建保留现有 caniuse-lite 数据过旧与 onnxruntime-web eval 提示；本轮未升级依赖。

## 真实浏览器

使用 Playwright CLI 操作 Chromium，最终 UI 验收使用本地生产预览 `http://127.0.0.1:5186`。开发服务器会因测试输出文件变化重载，未将该重载当作教学状态缺陷或验收结果。

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| OGS 入门前 6 页 | 黑白双方落子、逐题完成与继续正常 | [手机截图](../../output/playwright/source-intro-390.png) |
| OGS 倒扑 | 学生落子后显示真实应手；中途示范前后查看并返回原局面；偏离后继续试下，撤回并按原解提子完成 | [试下截图](../../output/playwright/source-exploration-390.png) |
| 原题错误分支 | 原题反驳实际落子，可继续试下及撤回，没有锁盘 | [同题桌面](../../output/playwright/source-desktop-1280.png) |
| OGS 终局 | 停着→点击整块选择 4 颗死子→确认→结束；显示黑 24、白 22 | [选死子](../../output/playwright/teaching-ending-selected-four-stable.png)、[结束](../../output/playwright/teaching-ending-finished-stable.png) |
| GGG 原始 19 路题 | 显示局部目标；偏离后应手、撤回，按原解作答完成 | [目标](../../output/playwright/teaching-ggg-320-objective.png)、[完成](../../output/playwright/teaching-ggg-320-correct-stable.png) |
| 简洁讲解 | 320×640 默认一句目标；展开为 3 个真实列表项；提示不残留旧列表或重复题干 | [目标](../../output/playwright/teaching-concise-task-320.png)、[讲解](../../output/playwright/teaching-concise-notes-320.png)、[提示](../../output/playwright/teaching-concise-hint-320.png) |
| 响应式 | 320×640、390×844、844×390、1280×800：无横向溢出，气泡不覆盖棋盘，窄屏可纵向滚动 | [窄屏](../../output/playwright/source-small-320.png)、[横屏](../../output/playwright/source-landscape-844.png)、[桌面讲解](../../output/playwright/teaching-concise-notes-desktop.png) |
| 关于致谢 | 保留原致谢，加入两套来源、许可与改编说明；题目界面不出现来源及内部验证标签 | [GGG 致谢](../../output/playwright/about-credits-320-ggg.png)、[许可区](../../output/playwright/about-credits-320-bottom.png) |

最终构建后重新执行简洁文案浏览器流程，通过；另从实际致谢页读取 6 个本地链接（5 个独立资源），浏览器请求全部 HTTP 200，正文分别匹配许可与来源说明，没有返回首页 HTML。许可与说明随构建打包，不依赖尚未推送的仓库文件。

## 未覆盖项

- 中文适配尚无专业棋手审校、真人新手试学或隔天迁移测评；自动检查不等于教学质量的完整证明。
- 19 路原图在 320 宽屏幕较密。棋盘已有双指缩放/平移，本轮未在真实触摸设备验收。
- 未新增真实 ONNX 推理、Android 或 TapTap 原生验收；进入教学前默认对局初始化产生的 ONNX WebGPU 回退信息不作为本轮推理验证。
- 浏览器抽查覆盖上述代表性课程；其余课程的完整树与操作由自动回归核对，未逐题人工通关。

来源与设计：[教学设计](../teaching-agent-design.md)、[第三方声明](../../THIRD_PARTY_NOTICES.md)。
