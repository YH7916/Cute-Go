import React, { useState } from 'react';
import { Play, Cpu, BookOpen, Globe, Download, Settings, Zap, Info, PenTool, User as UserIcon, Palette, Swords, Gamepad2, type LucideIcon } from 'lucide-react';
import { TopBar } from './common/TopBar';
import type { GameType } from '../types';

type GameTabType = 'go' | 'gomoku';
type StartGameHandler = (mode: 'PvP' | 'PvAI', aiType?: 'local' | 'fun', gameType?: GameType) => void;
const tabToGameType = (tab: GameTabType): GameType => tab === 'go' ? 'Go' : 'Gomoku';

interface StartScreenProps {
    onStartGame: StartGameHandler;
    onOpenTsumego: () => void;
    onOpenTutorial: () => void;
    onOpenOnline: () => void;
    onOpenImport: () => void;
    onOpenSettings: (gameType?: GameType) => void;
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
                    <button onClick={() => onOpenSettings(tabToGameType(activeTab))} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
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

            {/* Main Scrollable Content */}
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
                            onStartSetup={onStartSetup}
                            onOpenUserPage={onOpenUserPage}
                            onOpenSkinShop={onOpenSkinShop}
                        />
                    )}

                </div>
            </div>

            {/* 底部悬浮 Tab 栏 */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
                <div className="relative bg-[#e3c086] border-[2px] border-[#b88742] border-b-[5px] rounded-full px-2 py-1.5 flex gap-1.5 shadow-[0_2px_8px_rgba(92,64,51,0.15)] overflow-hidden">
                    <div
                        className="absolute left-2 top-1.5 bottom-1.5 w-24 rounded-full bg-[#fcf6ea] shadow-[0_2px_4px_rgba(92,64,51,0.15)] transition-transform duration-300 ease-out"
                        style={{
                            transform: activeTab === 'gomoku'
                                ? 'translateX(calc(6rem + 0.375rem))'
                                : 'translateX(0)'
                        }}
                    />
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

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`relative z-10 w-24 whitespace-nowrap px-4 py-2 rounded-full font-black text-sm transition-colors duration-200 ${
            active
                ? 'text-[#5c4033]'
                : 'text-[#8c6b38] hover:text-[#5c4033]'
        }`}
    >
        {label}
    </button>
);

interface GoContentProps {
    onStartGame: StartGameHandler;
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
                onClick={() => onStartGame('PvP', undefined, 'Go')}
                className="btn-retro bg-[#997c55] border-[#5c4033] text-[#fcf6ea] hover:bg-[#8a6f4c] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#fcf6ea]/20 group-hover:scale-110 transition-transform shrink-0">
                    <Play size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">本地双人</span>
            </button>

            <button
                onClick={() => onStartGame('PvAI', 'fun', 'Go')}
                className="btn-retro bg-[#a8d5a2] border-[#5a8f55] text-[#2d5a28] hover:bg-[#96c490] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#2d5a28]/10 group-hover:scale-110 transition-transform shrink-0">
                    <Gamepad2 size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">娱乐模式</span>
            </button>

            <button
                onClick={() => onStartGame('PvAI', 'local', 'Go')}
                className="btn-retro bg-[#e3c086] border-[#b88742] text-[#5c4033] hover:border-[#9f6f32] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#5c4033]/10 group-hover:scale-110 transition-transform shrink-0">
                    <Cpu size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">挑战 AI</span>
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

interface GomokuContentProps {
    onStartGame: StartGameHandler;
    onOpenTutorial: () => void;
    onOpenOnline: () => void;
    onStartSetup: () => void;
    onOpenUserPage: () => void;
    onOpenSkinShop: () => void;
}

const GomokuContent: React.FC<GomokuContentProps> = ({
    onStartGame, onOpenTutorial, onOpenOnline,
    onStartSetup, onOpenUserPage, onOpenSkinShop,
}) => (
    <>
        <div className="grid grid-cols-1 gap-3 w-full lg:w-4/5">
            <button
                onClick={() => onStartGame('PvP', undefined, 'Gomoku')}
                className="btn-retro bg-[#997c55] border-[#5c4033] text-[#fcf6ea] hover:bg-[#8a6f4c] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#fcf6ea]/20 group-hover:scale-110 transition-transform shrink-0">
                    <Play size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">本地双人</span>
            </button>

            <button
                onClick={() => onStartGame('PvAI', 'local', 'Gomoku')}
                className="btn-retro bg-[#e3c086] border-[#b88742] text-[#5c4033] hover:border-[#9f6f32] h-16 rounded-xl flex items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
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
            <FeatureButton icon={UserIcon} label="个人中心" onClick={onOpenUserPage} color="btn-beige" />
        </div>
    </>
);

const FeatureButton: React.FC<{ icon: LucideIcon; label: string; onClick: () => void; color: string }> = ({
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
