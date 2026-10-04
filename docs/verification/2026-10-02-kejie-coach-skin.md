# 柯洁陪练精灵皮肤

日期：2026-10-02。

## 第二版：统一褚嬴画风

- 根据用户反馈，重绘柯洁，使用褚嬴作主要画风参考，赛事照片仅作人物辨识参考。改为简化鼻口、利落动漫眉眼、成块黑色发束和少量分层阴影，保留眼镜、西装白衬衫及执黑子。
- 当前图片仍为 `public/coach/kejie/poster.png`，1208 × 1302、RGBA、626355 字节；透明角点 alpha 为 0。初版备份 `output/imagegen/kejie/poster-v1.png`。
- 内置 `image_gen` 提示词：`output/imagegen/kejie/prompt-v2.txt`。`utils/coachSkins.ts` 的版本更新为 `kejie-chuying-style-2`，避免已缓存图片覆盖新稿。
- 浏览器确认商店读取新版 URL，完整解码；375 × 667 窄屏并排比较褚嬴/柯洁，实际陪练显示和本地提示气泡正常。截图：`output/playwright/kejie/shop-style-v2-mobile.png`、`coach-style-v2-mobile.png`。
- 本次 `npm run check` 的 contracts、lint、typecheck 通过，测试 735/749；14 项失败来自工作区并行陪练界面调整后的旧交互断言（含已移除的「问柯洁」文字），未修改这些交互或测试来放行。日志：`output/kejie-style-v2-check.log`。
- 单独 `npm run build` 通过，日志 `output/kejie-style-v2-build.log`。仍未验收 Android / TapTap 原生。

以下为初版实现时的历史验收记录。

## 初版功能与素材

- 外观商店新增「陪练精灵」分类，褚嬴与柯洁可以即时切换；`useAppSettings` 持久化 `coachSkin`，旧档案、未知值与损坏值回退褚嬴。
- `utils/coachSkins.ts` 统一设置校验、商店及陪练展示的皮肤身份。实际角色复用 `CoachPet`；助手标签、气泡无障碍名称跟随选中皮肤。
- 柯洁使用一张透明背景 Q 版立绘，保留短发、黑框眼镜、脸型、西装白衬衫与执黑子特征。待机、思考、讲解、鼓励使用轻微 CSS 动效，并保留隐藏页面暂停与减少动态偏好；不是逐帧角色动画。褚嬴继续使用原有 sprites。
- 图片：`public/coach/kejie/poster.png`，1208 × 1302、RGBA、892857 字节。检查 alpha 角点为 0，浏览器确认透明背景、完整身体与等比显示。
- 参考：[赛事照片及原报道](https://k.sina.cn/article_6839266384_197a6ec5000100e5dm.html)。参考照片仅保存在 `output/imagegen/kejie/reference-kejie.jpg`；运行时使用生成插画。
- 使用内置 `image_gen`，以赛事照片为人物参考、原有褚嬴为画风参考；完整生成提示词：`output/imagegen/kejie/prompt.txt`。生成原图保留在 Codex 生成目录，项目消费本地副本。

## 实际浏览器验收

本机 Vite 页面 `http://127.0.0.1:5192/`，Codex 内置浏览器。

- 桌面与 375 × 667 竖屏：三类外观入口可见，两张皮肤卡不横向溢出；柯洁选中标识正确。
- 选择柯洁、刷新、从首页进入 AI 陪练：角色和「问柯洁」仍正确；打开讲解、点击提示，出现「柯洁提示」气泡。
- 对局内切回褚嬴，再切回柯洁：选择与气泡名称同步。
- 实际显示 `coach/kejie/poster.png?v=kejie-reference-1`，`background-size: contain`。375px 竖屏陪练区域 clientHeight / scrollHeight 同为 148px。
- 截图：`output/playwright/kejie/shop-desktop.png`、`shop-mobile.png`、`coach-desktop.png`、`coach-mobile.png`。并行界面任务恢复经典对局布局后，已重拍最终商店和竖屏陪练图。

## 验证边界

未进行 Android / TapTap 原生验收。本次不改变棋力、规则或模型调用，也不声称验证云端服务。浏览器使用本地提示完成皮肤验收。

## 工程检查

- `npm test`：749 / 749 通过，无跳过；日志 `output/kejie-tests.log`。
- `npm run typecheck`、`npm run build`：通过；日志 `output/kejie-typecheck.log`、`output/kejie-build.log`。
- 本次涉及的源码与回归文件 ESLint：通过。`git diff --check`：通过。
- 已运行 `npm run check`，contracts 通过后停在 lint：另一并行界面任务的临时源码 `output/coach-ui-refine/fixture.tsx` 触发 `boundaries/no-unknown-files`；日志 `output/kejie-check.log`。保留该文件，未移动、删除或放宽检查规则。因此不能宣称完整 canonical check 通过。
- 并行任务移除紧凑对局栏后，本次回归适配真实 `AppView` 调用链，验证两皮肤下助手收到正确选择、经典黑白卡提子/材质/思考标记不变。没有恢复被并行任务移除的界面。
