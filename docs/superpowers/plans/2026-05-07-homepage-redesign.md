# 首页重设计 + 娱乐模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页加围棋/五子棋底部悬浮木制 tab 栏，围棋新增"娱乐模式"入口（手写AI），"AI对战"改为"挑战AI"，设置页难度标题区分游戏类型。

**Architecture:** 在 StartScreen.tsx 内部维护 `gameType` state 控制 tab，根据 gameType 渲染不同按钮组。新增 `'fun'` aiType 传入 App.tsx 的 handleStartGame，Fun difficulty 走 getBeginnerAIMove，Easy 恢复走 ONNX 模型。

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 3

---

## File Map

| 文件 | 操作 | 说明 |
|------|------|------|
| `types.ts` | 修改 | Difficulty 加 `'Fun'` |
| `utils/aiConfig.ts` | 修改 | 加 Fun 配置，Easy 恢复 useModel:true |
| `worker/ai.worker.ts` | 修改 | Fun 模式走 getBeginnerAIMove，Easy 走模型 |
| `components/StartScreen.tsx` | 重写 | 加 tab 栏，围棋/五子棋内容分离 |
| `components/SettingsModal.tsx` | 修改 | 难度标题动态显示游戏类型 |
| `App.tsx` | 修改 | handleStartGame 处理 'fun' aiType |

---

## Task 1: types.ts — 加 Fun difficulty

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: 修改 Difficulty 类型**

打开 `types.ts`，找到：
```ts
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
```
改为：
```ts
export type Difficulty = 'Fun' | 'Easy' | 'Medium' | 'Hard';
```

- [ ] **Step 2: 验证编译**

```bash
npm run typecheck
```
预期：可能有 exhaustive switch 报错，记录下来，后续任务修复。

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: Difficulty 类型加 Fun 模式"
```

---

## Task 2: aiConfig.ts — Fun 配置 + Easy 恢复

**Files:**
- Modify: `utils/aiConfig.ts`

- [ ] **Step 1: 修改 aiConfig.ts**

打开 `utils/aiConfig.ts`，将整个文件改为：

```ts
export interface AIConfig {
    useModel: boolean;
    simulations: number;
    randomness: number;
    temperature: number;
    heuristicFactor: number;
}

export function getAIConfig(difficulty: string): AIConfig {
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

    // Fun — 手写初学者AI，不加载模型
    if (difficulty === 'Fun') {
        return {
            useModel: false,
            simulations: 1,
            randomness: 0,
            temperature: 0,
            heuristicFactor: 1.0
        };
    }

    // Easy — ONNX模型，高temperature随机采样
    if (difficulty === 'Easy') {
        return {
            useModel: true,
            simulations: 1,
            randomness: 0,
            temperature: 2.1,
            heuristicFactor: 1.0
        };
    }

    // Medium
    if (difficulty === 'Medium') {
        return {
            useModel: true,
            simulations: isMobile ? 2 : 4,
            randomness: 0,
            temperature: 0.22,
            heuristicFactor: 1.0
        };
    }

    // Hard
    return {
        useModel: true,
        simulations: isMobile ? 10 : 25,
        randomness: 0,
        temperature: 0,
        heuristicFactor: 1.0
    };
}
```

- [ ] **Step 2: 验证编译**

```bash
npm run typecheck
```
预期：0 errors。

- [ ] **Step 3: Commit**

```bash
git add utils/aiConfig.ts
git commit -m "feat: aiConfig 加 Fun 模式，Easy 恢复 ONNX 模型"
```

---

## Task 3: worker/ai.worker.ts — Fun 走手写AI，Easy 走模型

**Files:**
- Modify: `worker/ai.worker.ts`

- [ ] **Step 1: 修改 Go section 的 Easy/Fun 分支**

找到 worker 里的这段代码（Go section 开头）：

```ts
// Easy 模式：用手写初学者 AI，不走 ONNX 模型
if (difficulty === 'Easy' && gameType === 'Go') {
```

改为只有 Fun 走手写AI：

```ts
// Fun 模式：用手写初学者 AI，不走 ONNX 模型
if (difficulty === 'Fun' && gameType === 'Go') {
```

- [ ] **Step 2: 验证编译**

```bash
npm run typecheck
```
预期：0 errors。

- [ ] **Step 3: Commit**

```bash
git add worker/ai.worker.ts
git commit -m "feat: worker Fun 模式走手写AI，Easy 恢复走 ONNX"
```

---

## Task 4: App.tsx — handleStartGame 处理 'fun' aiType

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: 更新 handleStartGame 签名**

找到：
```ts
const handleStartGame = (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local') => {
```
改为：
```ts
const handleStartGame = (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local' | 'fun') => {
```

- [ ] **Step 2: 在 handleStartGame 里加 fun 分支**

找到 `if (mode === 'PvAI') {` 块，在 `if (aiType === 'cloud')` 之前加：

```ts
if (aiType === 'fun') {
    setUseCloud(false);
    settings.setDifficulty('Fun');
    // Fun 模式不加载模型，worker 只需要 rules
    if (!webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
        webAiEngine.initializeAI({ needModel: false });
    }
}
```

- [ ] **Step 3: 更新 StartScreen 的 onStartGame prop 类型**

找到 App.tsx 里传给 StartScreen 的地方：
```tsx
onStartGame={handleStartGame}
```
这里不需要改，因为 StartScreen 的 prop 类型会在 Task 5 里更新。

- [ ] **Step 4: 验证编译**

```bash
npm run typecheck
```
预期：StartScreen prop 类型不匹配的报错，Task 5 修复。

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: App.tsx handleStartGame 支持 fun aiType"
```

---

## Task 5: StartScreen.tsx — 底部 tab 栏 + 内容重组

**Files:**
- Modify: `components/StartScreen.tsx`

- [ ] **Step 1: 完整替换 StartScreen.tsx**

```tsx
import React, { useState } from 'react';
import { Play, Cpu, BookOpen, Globe, Download, Settings, Heart, Zap, Info, PenTool, User as UserIcon, Palette, Swords, Gamepad2 } from 'lucide-react';
import { CURRENT_VERSION } from '../utils/constants';
import { TopBar } from './common/TopBar';

type GameTabType = 'go' | 'gomoku';

interface StartScreenProps {
    onStartGame: (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local' | 'fun') => void;
    onOpenTsumego: () => void;
    onOpenTutorial: () => void;
    onOpenOnline: () => void;
    onOpenImport: () => void;
    onOpenSettings: () => void;
    onOpenAbout: () => void;
    onStartSetup: () => void;
    onOpenUserPage: () => void;
    onOpenSkinShop: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
    onStartGame,
    onOpenTsumego,
    onOpenTutorial,
    onOpenOnline,
    onOpenImport,
    onOpenSettings,
    onOpenAbout,
    onStartSetup,
    onOpenUserPage,
    onOpenSkinShop,
}) => {
    const [activeTab, setActiveTab] = useState<GameTabType>('go');

    return (
        <div className="absolute inset-0 z-30 bg-[#f7e7ce] flex flex-col items-center justify-start overflow-hidden animate-in fade-in duration-500">
            <TopBar
                leftButtons={<>
                    <button onClick={onOpenSettings} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
                    <button onClick={onOpenAbout} className="btn-retro btn-brown p-3 rounded-xl"><Info size={20} /></button>
                </>}
                rightContent={<>
                    <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide font-['GenSenRounded']">
                        CuteGo
                    </span>
                    <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086] mt-1">
                        首页
                    </span>
                </>}
            />

            {/* Main Scrollable Content — 底部留出 tab 栏高度 */}
            <div className="w-full flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center p-6 pb-24 md:p-12 md:pb-28">
                <div className="max-w-4xl w-full flex flex-col items-center gap-6 my-auto">

                    {activeTab === 'go' ? (
                        <GoContent
                            onStartGame={onStartGame}
                            onOpenTsumego={onOpenTsumego}
                            onOpenTutorial={onOpenTutorial}
                            onOpenOnline={onOpenOnline}
                            onOpenImport={onOpenImport}
                            onStartSetup={onStartSetup}
                            onOpenUserPage={onOpenUserPage}
                            onOpenSkinShop={onOpenSkinShop}
                        />
                    ) : (
                        <GomokuContent
                            onStartGame={onStartGame}
                            onOpenTutorial={onOpenTutorial}
                            onOpenOnline={onOpenOnline}
                            onOpenImport={onOpenImport}
                            onStartSetup={onStartSetup}
                            onOpenUserPage={onOpenUserPage}
                            onOpenSkinShop={onOpenSkinShop}
                        />
                    )}

                    <div className="mt-4 text-[#8c6b38]/60 text-xs font-medium pb-2">
                        v{CURRENT_VERSION} • Designed with <Heart size={12} className="inline text-red-400 fill-current" /> by Yokaku
                    </div>
                </div>
            </div>

            {/* 底部悬浮木制 Tab 栏 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                <div className="bg-[#c8a96e] border-[3px] border-[#5c4033] rounded-2xl p-1.5 flex gap-1.5 shadow-[0_4px_12px_rgba(92,64,51,0.4),inset_0_2px_4px_rgba(0,0,0,0.2)]">
                    <TabButton
                        label="围棋"
                        active={activeTab === 'go'}
                        onClick={() => setActiveTab('go')}
                    />
                    <TabButton
                        label="五子棋"
                        active={activeTab === 'gomoku'}
                        onClick={() => setActiveTab('gomoku')}
                    />
                </div>
            </div>
        </div>
    );
};

// --- Tab 按钮 ---
const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all duration-200 ${
            active
                ? 'bg-[#5c4033] text-[#fcf6ea] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]'
                : 'text-[#5c4033] hover:bg-[#b8956a]/50'
        }`}
    >
        {label}
    </button>
);

// --- 围棋内容 ---
interface GoContentProps {
    onStartGame: (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local' | 'fun') => void;
    onOpenTsumego: () => void;
    onOpenTutorial: () => void;
    onOpenOnline: () => void;
    onOpenImport: () => void;
    onStartSetup: () => void;
    onOpenUserPage: () => void;
    onOpenSkinShop: () => void;
}

const GoContent: React.FC<GoContentProps> = ({
    onStartGame, onOpenTsumego, onOpenTutorial, onOpenOnline,
    onOpenImport, onStartSetup, onOpenUserPage, onOpenSkinShop,
}) => (
    <>
        <div className="grid grid-cols-1 gap-3 w-full lg:w-4/5">
            <button
                onClick={() => onStartGame('PvP')}
                className="btn-retro bg-[#997c55] border-[#5c4033] text-[#fcf6ea] hover:bg-[#8a6f4c] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#fcf6ea]/20 group-hover:scale-110 transition-transform shrink-0">
                    <Play size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">本地双人</span>
            </button>

            <button
                onClick={() => onStartGame('PvAI', 'fun')}
                className="btn-retro bg-[#a8d5a2] border-[#5a8f55] text-[#2d5a28] hover:bg-[#96c490] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#2d5a28]/10 group-hover:scale-110 transition-transform shrink-0">
                    <Gamepad2 size={20} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-lg font-black tracking-wide leading-tight">娱乐模式</span>
                    <span className="text-xs font-medium opacity-70">手写AI · 秒启动</span>
                </div>
            </button>

            <button
                onClick={() => onStartGame('PvAI', 'local')}
                className="btn-retro bg-[#e3c086] border-[#d4a866] text-[#5c4033] hover:border-[#bfa15f] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#5c4033]/10 group-hover:scale-110 transition-transform shrink-0">
                    <Cpu size={20} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-lg font-black tracking-wide leading-tight">挑战 AI</span>
                    <span className="text-xs font-medium opacity-70">ONNX 模型 · 需加载</span>
                </div>
            </button>

            <button
                onClick={onOpenOnline}
                className="btn-retro bg-[#aecbeb] border-[#8cacd6] text-[#3e5c76] hover:bg-[#9dbddb] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#3e5c76]/10 group-hover:scale-110 transition-transform shrink-0">
                    <Globe size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">联机对战</span>
            </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full lg:w-4/5">
            <FeatureButton icon={Palette} label="外观商店" onClick={onOpenSkinShop} color="btn-beige" />
            <FeatureButton icon={Zap} label="死活题闯关" onClick={onOpenTsumego} color="btn-beige" />
            <FeatureButton icon={PenTool} label="电子挂盘" onClick={onStartSetup} color="btn-beige" />
            <FeatureButton icon={BookOpen} label="新手教程" onClick={onOpenTutorial} color="btn-beige" />
            <FeatureButton icon={Download} label="导入导出" onClick={onOpenImport} color="btn-beige" />
            <FeatureButton icon={UserIcon} label="个人中心" onClick={onOpenUserPage} color="btn-beige" />
        </div>
    </>
);

// --- 五子棋内容 ---
interface GomokuContentProps {
    onStartGame: (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local' | 'fun') => void;
    onOpenTutorial: () => void;
    onOpenOnline: () => void;
    onOpenImport: () => void;
    onStartSetup: () => void;
    onOpenUserPage: () => void;
    onOpenSkinShop: () => void;
}

const GomokuContent: React.FC<GomokuContentProps> = ({
    onStartGame, onOpenTutorial, onOpenOnline,
    onOpenImport, onStartSetup, onOpenUserPage, onOpenSkinShop,
}) => (
    <>
        <div className="grid grid-cols-1 gap-3 w-full lg:w-4/5">
            <button
                onClick={() => onStartGame('PvP')}
                className="btn-retro bg-[#997c55] border-[#5c4033] text-[#fcf6ea] hover:bg-[#8a6f4c] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#fcf6ea]/20 group-hover:scale-110 transition-transform shrink-0">
                    <Play size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">本地双人</span>
            </button>

            <button
                onClick={() => onStartGame('PvAI', 'local')}
                className="btn-retro bg-[#e3c086] border-[#d4a866] text-[#5c4033] hover:border-[#bfa15f] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#5c4033]/10 group-hover:scale-110 transition-transform shrink-0">
                    <Swords size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">AI 对战</span>
            </button>

            <button
                onClick={onOpenOnline}
                className="btn-retro bg-[#aecbeb] border-[#8cacd6] text-[#3e5c76] hover:bg-[#9dbddb] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#3e5c76]/10 group-hover:scale-110 transition-transform shrink-0">
                    <Globe size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">联机对战</span>
            </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full lg:w-4/5">
            <FeatureButton icon={Palette} label="外观商店" onClick={onOpenSkinShop} color="btn-beige" />
            <FeatureButton icon={PenTool} label="电子挂盘" onClick={onStartSetup} color="btn-beige" />
            <FeatureButton icon={BookOpen} label="新手教程" onClick={onOpenTutorial} color="btn-beige" />
            <FeatureButton icon={Download} label="导入导出" onClick={onOpenImport} color="btn-beige" />
            <FeatureButton icon={UserIcon} label="个人中心" onClick={onOpenUserPage} color="btn-beige" />
        </div>
    </>
);

// --- 工具按钮 ---
const FeatureButton: React.FC<{ icon: any; label: string; onClick: () => void; color: string }> = ({
    icon: Icon, label, onClick, color,
}) => (
    <button
        onClick={onClick}
        className={`btn-retro ${color} h-14 rounded-xl flex flex-row items-center justify-center px-3 gap-2 transition-transform hover:-translate-y-1 group`}
    >
        <div className="p-1.5 rounded-full bg-[#5c4033]/5 group-hover:bg-[#5c4033]/10 transition-colors shrink-0">
            <Icon size={16} className="text-[#5c4033] group-hover:scale-110 transition-transform md:w-5 md:h-5" />
        </div>
        <span className="text-sm font-bold text-[#5c4033]">{label}</span>
    </button>
);
```

- [ ] **Step 2: 验证编译**

```bash
npm run typecheck
```
预期：0 errors。

- [ ] **Step 3: Build 验证**

```bash
npm run build
```
预期：✓ built 成功。

- [ ] **Step 4: Commit**

```bash
git add components/StartScreen.tsx
git commit -m "feat: 首页加围棋/五子棋底部木制 tab 栏，新增娱乐模式入口"
```

---

## Task 6: SettingsModal.tsx — 难度标题区分游戏类型

**Files:**
- Modify: `components/SettingsModal.tsx`

- [ ] **Step 1: 找到难度标题位置**

在 `components/SettingsModal.tsx` 里找到：
```tsx
AI 难度
```
（约第139行）

- [ ] **Step 2: 改为动态标题**

将静态文字 `AI 难度` 改为：
```tsx
{tempGameType === 'Go' ? '围棋 AI 难度' : '五子棋 AI 难度'}
```

其中 `tempGameType` 是 SettingsModal 内部已有的 state（`useState<GameType>`），直接复用即可。

- [ ] **Step 3: Fun 难度在设置里隐藏**

找到难度按钮的渲染循环，通常是：
```tsx
(['Easy', 'Medium', 'Hard'] as Difficulty[]).map(diff => ...)
```
确认 `Fun` 不在这个列表里（Fun 是通过首页娱乐模式入口设置的，不应该在设置里出现）。如果有 `(['Fun', 'Easy', 'Medium', 'Hard'])` 的写法，改回 `(['Easy', 'Medium', 'Hard'])`。

- [ ] **Step 4: 验证编译**

```bash
npm run typecheck
```
预期：0 errors。

- [ ] **Step 5: Commit**

```bash
git add components/SettingsModal.tsx
git commit -m "feat: 设置页难度标题区分围棋/五子棋"
```

---

## Task 7: 最终验证

- [ ] **Step 1: 完整 typecheck**

```bash
npm run typecheck
```
预期：0 errors。

- [ ] **Step 2: Build**

```bash
npm run build
```
预期：✓ built 成功，无警告增加。

- [ ] **Step 3: 对照验证标准**

- [ ] 围棋/五子棋 tab 切换正常，内容区更新
- [ ] 娱乐模式不触发模型加载（aiConfig.useModel=false）
- [ ] 挑战AI正常，Easy 走 ONNX 模型（temperature=2.1）
- [ ] 五子棋AI对战正常
- [ ] 设置页面难度标题正确显示"围棋 AI 难度"或"五子棋 AI 难度"
- [ ] tab 栏木制凹槽风格与整体一致

- [ ] **Step 4: 最终 commit**

```bash
git add -A
git commit -m "feat: 首页重设计完成 — 木制tab栏、娱乐模式、挑战AI"
```
