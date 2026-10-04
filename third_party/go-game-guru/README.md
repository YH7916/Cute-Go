# Go Game Guru：浅变化练习来源包

固定上游：[`gogameguru/go-problems`](https://github.com/gogameguru/go-problems/tree/eee12b2e39d59dbe81a8b9eaa7d4f103978d9224)，提交 `eee12b2e39d59dbe81a8b9eaa7d4f103978d9224`。2026-10-03 从 `master` 读取并固定，不在运行时请求可变分支。

署名：An Younggil（职业八段）、David Ormerod。依据为原样保存的 [上游 README](UPSTREAM-README.md)；该署名不表示作者审校或认可本项目的翻译、选题顺序与交互适配。

原始题谱、注释及其中文翻译遵循 **CC BY-NC-SA 4.0**：[完整原许可](LICENSE)、[许可页面](https://creativecommons.org/licenses/by-nc-sa/4.0/)。须保留署名、来源、许可和修改说明；本来源包没有向根项目授予额外许可。此处原 SGF 未改动；本项目的改动为选题、JSON 转换与 AI 辅助中文翻译。根项目整体许可另行管理。

## 内容与筛选

从上游 `weekly-go-problems/easy` 的 **140 个实际 SGF** 中筛选 16 题。先扫描全部解答树深度，再核对入选题的全部原注释、正解标记和变化结构；没有随机抽题，也没有把 `easy` 等同于零基础。

前 10 题主要降低阅读长度：正解 1–3 手、全树最深 2–4 手，包含不同白方应手、同一局面的多个正确落点，以及提子后回到原点落子的变化。后 6 题增加有原文说明的连接、两眼、对杀、气紧／倒扑、吃断子练习。它们应放在相应基础教学之后，不能替代从零讲规则的课程。

| 题号 | 原文标为正确的手数 | 全树最大手数 | 选入依据 |
| --- | --- | --- | --- |
| 25 | 1 | 2 | 最短变化 |
| 06 | 3 | 3 | 两条短变化 |
| 10 | 3 | 3 | 两种白方应手 |
| 15 | 3 | 3 | 提子后同点再落子 |
| 20 | 3 | 3 | 两种白方应手 |
| 47 | 3 | 4 | 同一应手后两个正确落点 |
| 11 | 3 | 4 | 有限短分支 |
| 05 | 3 | 4 | 同一候选后的不同反击 |
| 35 | 3 | 4 | 有限短分支 |
| 89 | 3 | 3 | 两种应手与同点再落子 |
| 74 | 1、5 | 5 | 原注释讲连接与自紧气 |
| 71 | 3 | 6 | 原注释讲两眼与失败原因 |
| 91 | 3 | 4 | 原注释讲对杀与气数 |
| 76 | 3 | 6 | 原注释比较双方气数 |
| 104 | 3、5 | 6 | 原注释讲气紧与倒扑 |
| 99 | 5 | 6 | 原题干要求吃断子 |

题谱中多数未标正解的变化没有文字解释。这里保留空白，不添加未经来源支持的棋理判断。选题备注是本项目的编排元数据，不冒充上游题干。

## 中立 JSON 契约

`manifest.json` 保存固定版本、每份原文件 SHA-256、署名、许可、编排备注及逐题核对过的正误节点 ID。`translations.zh-CN.json` 按完整英文原注释保存忠实译文。`problems.json` 是可复现生成结果；应用适配在课程域完成，本目录不直接接入 UI。

每道题包含 `id / source / boardSize / toPlay / initialStones / complexity / root`。棋盘保留原 `SZ[19]`、原摆子与原方位；坐标为左上角起的零基 `x/y`，没有缩盘、旋转或修改边界。

每个节点包含：

- `id`：原始分支顺序组成的稳定路径，如 `r.0.1.0`。
- `color / point`：根节点均为 `null`；落子为 `black|white` 与 `{x,y}`，停着的 `point` 为 `null`。
- `comments`：`{en, zh}[]`，保留原文；`properties` 保留所有原 SGF 属性，包括 `LB` 字母标记。
- `correct / wrong`：仅按 `manifest` 明列且核对过的原注释赋值。两者都是 `false` 代表**未标定**，不代表“可接受”或“失败”。
- `verdictSource`：已标定时为 `reviewed-original-comment`，其余为 `null`。
- `hasCorrectContinuation`：当前节点或后代是否出现原文明确的正确标记。仅是树结构信息，不能据此宣称其他落子必败。
- `children`：保留全部原变化顺序。

关键边界：

- **不把叶节点自动判正确。** 16 题有 57 个未标定叶节点，保持未知。
- `easy-74` 第一手已标正确，但仍有后续示范；正确节点允许有 `children`。
- `easy-99` 的 `Also correct.` 仍是正解；“also possible, but not the best”不标正解或必败。
- 本次仅 `easy-71` 两个节点由“无法做出两眼／黑棋会死”的明确原注释标为 `wrong`。其他未标正解的分支不统一猜测为失败。
- 谱中 A/B/C 的解释依赖对应节点 `properties.LB`；适配时不能丢掉字母标记。

## 生成与验证

```powershell
node --experimental-strip-types scripts/import-go-game-guru.mjs
node --experimental-strip-types scripts/import-go-game-guru.mjs --check
node scripts/verify-go-game-guru.mjs
```

脚本复用 `utils/sgfParser.ts` 的 `parseSGFToTree`，不新增 SGF 解析器。`core/go/sgf.ts` 的对局导入会顺序匹配全部落子，不用于解析解答分支。脚本核对原文件哈希、正解注释与清单一致性、所有原注释都有译文、坐标、执子交替及生成结果一致性。

最后一条命令只读核验生成文件，再与项目现有 `@sabaki/sgf` 独立解析结果逐节点对比：16 题全部属性与分支相同。复用 `core/go/rules.inspectMove` 和 `domains/game/positionState` 穷举原树的 **231 步**，含简单劫检查，均合法。这证明转换完整性与合法落子，不证明原题全局最优、分支穷尽性或新手难度标定。尚未做本题包的真人教学试用、中文专业审校或 UI 验收。
