import React, { useState } from 'react';
import { X, Check, Gem, Box, Sparkles } from 'lucide-react';
import { BOARD_THEMES, STONE_THEMES } from '../utils/themes';
import { StoneSkinPreview } from './common/StoneSkinPreview';
import { Button, Panel } from '../ui/common';
import { COACH_SKINS, COACH_SKIN_IDS, type CoachSkinId } from '../utils/coachSkins';

interface SkinShopModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentBoardSkin: string;
    currentStoneSkin: string;
    currentCoachSkin: CoachSkinId;
    onSetBoardSkin: (skin: string) => void;
    onSetStoneSkin: (skin: string) => void;
    onSetCoachSkin: (skin: CoachSkinId) => void;
}

export const SkinShopModal: React.FC<SkinShopModalProps> = ({
    isOpen,
    onClose,
    currentBoardSkin,
    currentStoneSkin,
    currentCoachSkin,
    onSetBoardSkin,
    onSetStoneSkin,
    onSetCoachSkin,
}) => {
    const [activeTab, setActiveTab] = useState<'stone' | 'board' | 'coach'>('stone');

    if (!isOpen) return null;

    const boardThemes = Object.entries(BOARD_THEMES);
    const stoneThemes = Object.entries(STONE_THEMES);

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-2xl shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[90vh] overflow-hidden relative">
                
                <div className="relative z-10 shadow-md bg-[#fcf6ea]">
                    {/* Header */}
                    <div className="bg-[#fcf6ea] border-b-2 border-[#e3c086] border-dashed p-4 flex justify-between items-center shrink-0">
                        <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">外观商店</h2>
                        <button
                            aria-label="关闭外观商店"
                            onClick={onClose} 
                            className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"
                        >
                            <X size={20}/>
                        </button>
                    </div>

                    {/* Appearance categories */}
                    <div className="p-3 sm:p-6 pb-4 shrink-0">
                        <div className="flex gap-2" role="group" aria-label="外观分类">
                            <Button
                                size="sm"
                                appearance="retro" variant={activeTab === 'stone' ? 'primary' : 'secondary'}
                                aria-pressed={activeTab === 'stone'} onClick={() => setActiveTab('stone')}
                                className="min-h-11 min-w-0 flex-1 flex items-center justify-center gap-1 px-2 sm:gap-2 whitespace-nowrap"
                            >
                                <Gem size={16} className="hidden sm:block shrink-0" />
                                棋子皮肤
                            </Button>
                            <Button
                                size="sm"
                                appearance="retro" variant={activeTab === 'board' ? 'primary' : 'secondary'}
                                aria-pressed={activeTab === 'board'} onClick={() => setActiveTab('board')}
                                className="min-h-11 min-w-0 flex-1 flex items-center justify-center gap-1 px-2 sm:gap-2 whitespace-nowrap"
                            >
                                <Box size={16} className="hidden sm:block shrink-0" />
                                棋盘主题
                            </Button>
                            <Button
                                size="sm"
                                appearance="retro" variant={activeTab === 'coach' ? 'primary' : 'secondary'}
                                aria-pressed={activeTab === 'coach'} onClick={() => setActiveTab('coach')}
                                className="min-h-11 min-w-0 flex-1 flex items-center justify-center gap-1 px-2 sm:gap-2 whitespace-nowrap"
                            >
                                <Sparkles size={16} className="hidden sm:block shrink-0" />
                                陪练精灵
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
                    {activeTab === 'coach' && (
                        <div className="space-y-4">
                            <p className="text-sm text-[#8c6b38]">选一位棋友，陪你慢慢学棋。</p>
                            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                {COACH_SKIN_IDS.map(id => {
                                    const skin = COACH_SKINS[id];
                                    const isCurrent = currentCoachSkin === id;
                                    return <Panel key={id} className="flex min-w-0 flex-col items-center gap-2 p-3 sm:p-4 text-center">
                                        <span className="w-full h-36 sm:h-44 flex items-center justify-center rounded-xl bg-[#f4e7d3]/65">
                                            <img src={`${import.meta.env.BASE_URL}${skin.assetRoot}poster.png?v=${skin.artVersion}`}
                                                alt={`${skin.name} Q版精灵`} className="w-full h-full object-contain p-2" />
                                        </span>
                                        <span className="text-lg font-black">{skin.name}</span>
                                        <span className="text-xs text-[#8c6b38]">{skin.subtitle}</span>
                                        <span className="text-xs leading-5 font-normal text-[#8c6b38]">{skin.description}</span>
                                        <Button type="button" appearance="retro" variant={isCurrent ? 'primary' : 'secondary'}
                                            aria-label={`选择${skin.name}陪练精灵`} aria-pressed={isCurrent}
                                            onClick={() => onSetCoachSkin(id)}
                                            className="mt-auto min-h-11 w-full flex items-center justify-center gap-1">
                                            {isCurrent && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                                            {isCurrent ? '使用中' : '使用'}
                                        </Button>
                                    </Panel>;
                                })}
                            </div>
                        </div>
                    )}
                    {activeTab === 'stone' && (
                        <div className="grid grid-cols-2 gap-4">
                            {stoneThemes.map(([id, theme]) => {
                                const isCurrent = currentStoneSkin === id;
                                return (
                                    <Panel key={id} className="flex min-w-0 flex-col items-center gap-3 p-3 sm:p-4 text-center">
                                        {/* Preview Area */}
                                        <StoneSkinPreview stoneSkin={id} />
                                        
                                        <span className="font-bold text-sm">{theme.name}</span>
                                        <Button type="button" appearance="retro" variant={isCurrent ? 'primary' : 'secondary'}
                                            aria-label={`选择${theme.name}棋子皮肤`} aria-pressed={isCurrent}
                                            onClick={() => onSetStoneSkin(id)}
                                            className="mt-auto min-h-11 w-full flex items-center justify-center gap-1">
                                            {isCurrent && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                                            {isCurrent ? '使用中' : '使用'}
                                        </Button>
                                    </Panel>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'board' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {boardThemes.map(([id, theme]) => {
                                const isCurrent = currentBoardSkin === id;
                                return (
                                    <Panel key={id} className="flex min-w-0 flex-col items-center gap-3 p-3 sm:p-4 text-center">
                                        {/* Preview Area */}
                                        <div 
                                            className="w-full h-28 rounded-xl shadow-inner relative overflow-hidden border-2 border-[#e3c086]"
                                            style={{
                                                backgroundColor: theme.background,
                                                backgroundImage: theme.backgroundImage,
                                                backgroundSize: theme.backgroundSize,
                                                backgroundRepeat: 'repeat',
                                                borderColor: theme.borderColor,
                                            }}
                                        >
                                            {/* Grid Preview */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                                <div className="w-20 h-20 border-2 border-b-0 border-r-0" style={{ borderColor: theme.lineColor }}></div>
                                                <div className="w-20 h-20 border-2 border-t-0 border-l-0" style={{ borderColor: theme.lineColor }}></div>
                                            </div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-2.5 h-2.5 rounded-full shadow-md" style={{ backgroundColor: theme.starPointColor }}></div>
                                            </div>
                                        </div>
                                        
                                        <span className="font-bold text-sm">{theme.name}</span>
                                        <Button type="button" appearance="retro" variant={isCurrent ? 'primary' : 'secondary'}
                                            aria-label={`选择${theme.name}棋盘主题`} aria-pressed={isCurrent}
                                            onClick={() => onSetBoardSkin(id)}
                                            className="mt-auto min-h-11 w-full flex items-center justify-center gap-1">
                                            {isCurrent && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                                            {isCurrent ? '使用中' : '使用'}
                                        </Button>
                                    </Panel>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
