# 首页重设计 + 娱乐模式

日期：2026-05-07

## 目标

1. 首页加围棋/五子棋底部悬浮 tab 栏，切换游戏类型
2. 围棋新增"娱乐模式"入口（手写AI，不加载ONNX模型）
3. "AI对战"改为"挑战AI"，语义更清晰
4. 设置页面难度标题区分围棋/五子棋
5. aiConfig Easy 恢复 useModel: true，娱乐模式用新的 'Fun' difficulty

---

## 底部 Tab 栏

**位置：** 首页底部悬浮，不占用滚动区域  
**风格：** 木制凹槽圆角，与整体棕色系一致（`bg-[#e3c086]`，`border-[#5c4033]`，内凹阴影）  
**两个 tab：** 围棋 / 五子棋  
**切换：** 内容区平滑过渡，tab 选中态用深色凹槽效果

```
┌─────────────────────────────────┐
│  [内容区：随 tab 切换]           │
│                                 │
├─────────────────────────────────┤
│  ╔══════════╗  ┌──────────┐    │  ← 悬浮底部 tab 栏
│  ║  围棋 ●  ║  │  五子棋  │    │    木制凹槽圆角风格
│  ╚══════════╝  └──────────┘    │
└─────────────────────────────────┘
```

---

## 围棋 Tab 内容

主要模式按钮（大按钮，全宽）：
- **本地双人** — 现有逻辑不变
- **娱乐模式** — 新增，调用 `onStartGame('PvAI', 'fun')`，difficulty='Fun'，不加载模型
- **挑战 AI** — 原"AI对战"改名，调用 `onStartGame('PvAI', 'local')`，使用上次难度设置
- **联机对战** — 现有逻辑不变

工具按钮（小按钮网格）：
- 死活题闯关、外观商店、电子挂盘、新手教程、导入导出、个人中心

---

## 五子棋 Tab 内容

主要模式按钮：
- **本地双人**
- **AI对战** — minimax，使用上次难度设置
- **联机对战**

工具按钮（同围棋，共用）：
- 外观商店、电子挂盘、新手教程、导入导出、个人中心

---

## 代码改动

### 1. `types.ts`
```ts
// Difficulty 加 'Fun'
export type Difficulty = 'Fun' | 'Easy' | 'Medium' | 'Hard';
```

### 2. `utils/aiConfig.ts`
```ts
// Fun 模式：手写AI，不加载模型
if (difficulty === 'Fun') {
  return { useModel: false, simulations: 1, randomness: 0, temperature: 0, heuristicFactor: 1.0 };
}
// Easy 恢复 useModel: true
if (difficulty === 'Easy') {
  return { useModel: true, simulations: 1, temperature: 2.1, ... };
}
```

### 3. `worker/ai.worker.ts`
```ts
// Fun 模式走 getBeginnerAIMove（现在 Easy 模式的逻辑迁移过来）
if ((difficulty === 'Fun' || difficulty === 'Easy') && gameType === 'Go') {
  // getBeginnerAIMove ...
}
```
> 注：Easy 是否也走手写AI待定，可以先让 Easy 走模型（temperature=2.1），Fun 走手写。

### 4. `components/StartScreen.tsx`
- 加 `gameType` state（'Go' | 'Gomoku'），默认 'Go'
- 加底部 tab 栏组件
- 根据 gameType 渲染不同按钮
- `onStartGame` 新增 `'fun'` aiType

### 5. `components/SettingsModal.tsx`
- 难度选择区域标题改为动态：
  - gameType === 'Go' → "围棋 AI 难度"
  - gameType === 'Gomoku' → "五子棋 AI 难度"
- SettingsModal 接收 `gameType` prop

### 6. `App.tsx`
- `handleStartGame` 处理新的 `'fun'` aiType
- Fun 模式设置 difficulty='Fun'，不初始化模型

---

## 不改动的部分

- 联机对战逻辑（Supabase，P5 再迁移）
- 五子棋 AI 逻辑（minimax 不变）
- 死活题逻辑
- 所有现有 hook

---

## 验证标准

- [ ] 围棋/五子棋 tab 切换正常，内容区更新
- [ ] 娱乐模式不触发模型加载，秒启动
- [ ] 挑战AI正常加载模型，使用上次难度
- [ ] 五子棋AI对战正常
- [ ] 设置页面难度标题正确显示游戏类型
- [ ] 视觉风格与现有一致（木制凹槽 tab）
