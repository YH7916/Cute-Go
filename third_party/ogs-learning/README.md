# OGS Learning Hub：来源锁定与入门选集

本目录保存 Online-Go.com 的官方 Learning Hub 源码、从源码提取的英文题目/局面/解答，以及本项目的中文翻译。它不是自行编写后仅引用 OGS 的题库，也不是 OGS 对本项目的认可。

## 来源与许可

- 官方仓库：[online-go/online-go.com](https://github.com/online-go/online-go.com)。
- 固定提交：[`8baf0345423d20d8f0ca18059e464c1e89862a40`](https://github.com/online-go/online-go.com/tree/8baf0345423d20d8f0ca18059e464c1e89862a40)，获取日期：2026-10-03。
- 正式课程顺序来自 [`src/views/LearningHub/sections.ts`](https://github.com/online-go/online-go.com/blob/8baf0345423d20d8f0ca18059e464c1e89862a40/src/views/LearningHub/sections.ts)，题目来自该目录下的 `Sections/**/*.tsx`。
- 各题源码保留 `Copyright (C) Online-Go.com` 及 **AGPL-3.0-or-later** 头部。许可原文见 [LICENSE](LICENSE)；本地提取、选编及翻译属于相应修改，应随对应源码与修改说明一并保留。
- 棋盘引擎 `online-go/goban` 的 Apache-2.0 不能替代本课程的 AGPL 许可。本项目没有复制 OGS 图片、声音、头像或主题资产；上游资产另有限制，见 [upstream/assets/LICENSE](upstream/assets/LICENSE)。

## 保存内容

- [upstream/](upstream/)：固定提交的 LearningHub 原始文件；`.ts/.tsx` 保存为 `.ts.txt/.tsx.txt`，仅作对应源码和审计资料，不进入运行时编译。
- [catalog.json](catalog.json)：按官方目录顺序选出的 25 课、98 页，保留原文、原始坐标串、规范化局面、全部正确/错误分支以及每页上游代码链接。
- [inventory.json](inventory.json)：正式目录启用的 248 课、3551 页清单。源码目录另有未注册课程文件，不能将文件数当成启用课程数。
- [english.json](english.json)：选集全部可见英文文案，按课/页 ID 索引。
- [zh-CN.json](zh-CN.json)：本项目在 2026-10-03 制作的中文翻译，不是 OGS 官方翻译，不宣称专业棋手审校。数字、棋子颜色、位置标记及原题答案保持对应。
- [../../domains/coach/sourceData/ogs.json](../../domains/coach/sourceData/ogs.json)：由提取器生成的精简运行时数据，只保留中文、原局面、标记、标准化答案及来源链接。原英文、原始配置和源码仍留在本目录，不重复打入应用包。
- [../../scripts/import-ogs-learning.mjs](../../scripts/import-ogs-learning.mjs)：使用 TypeScript AST 读取常量数据，不运行下载的 TSX。默认离线重建 JSON；`--fetch` 从上述固定提交重新获取源码再提取，网络失败会报错，不偷偷换到新的 HEAD。

离线复跑：`node scripts/import-ogs-learning.mjs`。翻译文件独立维护，提取器不覆盖中文；自动测试要求英文与中文键完整对应。

本地界面把原文 Pass/Finish 对应为“停一手”/“结束对局”，把 Basic Skills 的第二个 Territory 课程标题显示为“数地与死子”，以区分基础数地课程；这些是本项目的呈现改编，原英文名称留存在提取档案。提示方向也是本项目针对原知识点的短引导，不冒称原作者逐句提示。

## 选集顺序和抽取边界

基础规则的 7 课全保留，共 36 页：The Game of Go、Self-capture、Eyes、Ko、Territory、End of the Game、The Board。

基本原理选 10 课、每课 3 页：数气、棋块、打吃、提一子、提一块、逃棋、连接、切断、真假眼、做两眼。基础技巧选 8 课、每课 4 页：打吃方向、双打吃、征吃、倒扑、枷、数地、封地、对杀。始终保留原课第一页的讲解；后续选题覆盖不同棋形，包含适用课程中的执黑/执白和双方被打吃等差异。具体原始页索引固定在提取脚本 `SELECTED_PAGES`，不改变单题内部答案。

98 页包含 67 页落子树、28 页单选、2 页按钮动作和 1 页死子选择。

- `move-tree`：保留 `makePuzzleMoveTree(correct, wrong)` 两组全部原字符串及规范化坐标路径，双方从 `initial_player` 交替。正确/错误是上游有限变化的叶标记；未收录的合法落子不自动等于围棋错误。
- `choice`：从上游 `selectedValue` 与正确回调分支读取选项/答案；不是根据我们的算法重新猜答案。
- `action`：End of the Game 的第 1 页必须点击 Pass，第 3 页必须点击 Finish。这两页源码的 `b6` 树被明确注释为失败占位，不能当正确落子。
- `remove-stones`：End of the Game 第 2 页要求选择恰好 `fafbgbhb` 的四颗黑死子；它不是自由落子题。
- 未识别的完成条件会标为 `manual`，提取器遇到未知可执行表达式直接失败。本选集没有把只看图或点击继续当成独立答题成功的页面。

原始坐标既有人类坐标（略过 I 列、行号从底部起算），也有 SGF 坐标（左上角起算）。选集同时保留原字符串及 `{x,y}`，避免运行时猜测方向。默认棋盘为 9 路，部分基础页为 13/19 路；题形裁切范围只属于显示，不改变完整棋盘。

## 规则与质量边界

- OGS 的数地和终局示例采用 **地盘加提子** 的数目法：一颗死子同时产生俘子和空地点；示例黑 24、白 18+4=22。本项目其他对局的面积计分不能替换这些原题答案，界面应明确本组计分口径。
- 上游面向新手的“两眼”“对杀同气”等讲解是当前题形的教学解释，不扩张为包含双活、劫等所有情形的通用定理。
- 原题正确分支通过本项目实际围棋规则重放；这证明所收录落子的合法性，不证明上游列尽所有答案、不证明每题棋理最优，也不等于专家审校。
- 本项目不复用 OGS 错误后锁盘的 UI 行为；内容适配与当前交互由本项目领域/UI 实现。

检查入口：`npm test -- tests/ogs-learning-source.test.mjs`，验证官方注册顺序、完整基础页、坐标方向、全部正确变化合法重放、结束动作及死子精确条件、翻译键覆盖和源码许可留存。浏览器呈现与交互由主项目验收，不能用本目录的数据检查替代。
