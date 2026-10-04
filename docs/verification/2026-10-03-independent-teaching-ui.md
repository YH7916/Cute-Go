# 独立教学模式：浏览器与 UI 验收

> 历史快照：原新手教学随后恢复，进阶改为直接练习，末尾新增模式探索。当前行为见 [直接练习与新手收尾验收](2026-10-03-practice-first-teaching.md)。

日期：2026-10-03。本记录只说明当前实际操作，不代替课程专业审校。

## 界面与入口

- 首页分别进入“围棋教学”和“陪我下棋”。教学全页只挂载一个共享 `GameBoard`，不挂对弈计分、对弈控制或陪练会话。
- 教学复用 `CoachPet`、`CoachBubble`、`Panel`、`TopBar` 与原按钮主题。课程、参考资料及备份仅在“课程”弹层内；移除学堂统计仪表盘。
- 陪练复盘工具放入“更多”；普通复盘使用折叠的更多选项。试下、收藏保留。旧 `TutorialModal` 不再挂载或首次启动自动展示。

## 实际浏览器操作

工具：Playwright CLI，真实 Microsoft Edge，本地 Vite `http://127.0.0.1:5182`。

1. 1280×800：返回首页 → 围棋教学 → 首课示范，逐步看到黑落子、白覆盖黑子被拒绝、白改下空点 → 我来试试 → 直接点击交叉点，立即显示合法落子反馈，无另一次提交。
2. 390×844：首课反馈与“继续学习” → 同课下一练习；打开课程选择数气 → 示范 → 数字输入。实际输入 0 得到规则核算的失败反馈，点击再试一次，输入 6 成功。
3. 844×390：数地课连续示范 → 我来试试，输入标注为“目数”，输入 2 确认成功。棋盘、说明及确认按钮均在视口内。
4. 844×390：倒扑课三手示范 → 我来试试 → 左上角落子，自动显示白提黑的应手，仍停留“试一试”，未提前判成功；退一步 → 重新落子 → 原点回提，显示完成并提 3 子。
5. 返回首页 → 陪我下棋：分别检查手机与矮横屏。原 9 路棋盘、黑白提子卡、悔棋/停着/重开、角色与讲解/提示/更多均保留，无课程界面或数据仪表盘。
6. 最终手机数气页面 DOM 核对：`.board-viewport` 仅 1 个，无横向溢出；确认按钮底边 772、提示按钮底边 824，均小于视口高 844。矮横屏倒扑完成页面同样只有 1 张棋盘，主按钮底边 370，小于视口高 390。

实际看图后将手机数字输入标签缩为“气数/目数”，避免窄气泡内折行；只有连续变化题展示退一步，单步题不展示不能使用的撤回按钮。

## 截图

- [桌面教学](../../output/playwright/teaching-independent-desktop.png)
- [手机教学反馈](../../output/playwright/teaching-independent-mobile.png)
- [手机数气最终页面](../../output/playwright/teaching-number-mobile.png)
- [矮横屏数地](../../output/playwright/teaching-territory-landscape.png)
- [矮横屏倒扑中间应手](../../output/playwright/teaching-sequence-landscape.png)
- [返回陪练：手机](../../output/playwright/companion-after-teaching-mobile.png)
- [返回陪练：矮横屏](../../output/playwright/companion-after-teaching-landscape.png)

## 回归及限制

定向 UI 回归 49/49 通过：`learning-exercise-ui`、`coach-panel-ui`、`coach-assistant-ui`、`coach-game-chrome`、`coach-skins`、`tutorial-haptics`、`coach-settings-ui`。覆盖教学页面优先、共享棋盘与视觉偏好、数气/数目确认、阶段操作、原陪练布局与交互、低频复盘工具。全量验收结果另以根任务 `npm run check` 输出为准。

开发期间并行修改 hook 引起一次 Vite 热更新 hook 顺序失配，整页刷新后重新完成上述后续流程；最终新运行没有该异常。控制台仍有既存 favicon 404；首次普通对局启动曾记录 ONNX WebGPU 不可用转用现有后端的提示。未配置云服务。

手机与横屏为桌面 Edge 视口调整；未覆盖真实手机触摸/软键盘、Android/TapTap 原生、云问答、完整 ONNX 推理质量或真人教学效果。Node 组件测试不替代这些验证。
