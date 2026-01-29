import React, { useState } from 'react';
import { X, Check, Gem, Box } from 'lucide-react';
import { BOARD_THEMES, STONE_THEMES, BoardThemeId, StoneThemeId } from '../utils/themes';

interface SkinShopModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentBoardSkin: string;
    currentStoneSkin: string;
    onSetBoardSkin: (skin: string) => void;
    onSetStoneSkin: (skin: string) => void;
}

export const SkinShopModal: React.FC<SkinShopModalProps> = ({
    isOpen,
    onClose,
    currentBoardSkin,
    currentStoneSkin,
    onSetBoardSkin,
    onSetStoneSkin,
}) => {
    const [activeTab, setActiveTab] = useState<'stone' | 'board'>('stone');

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
                            onClick={onClose} 
                            className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"
                        >
                            <X size={20}/>
                        </button>
                    </div>

                    {/* Tab Slider */}
                    <div className="p-6 pb-4 shrink-0">
                        <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                            <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${activeTab === 'board' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                            <button 
                                onClick={() => setActiveTab('stone')} 
                                className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 flex items-center justify-center gap-2 ${activeTab === 'stone' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}
                            >
                                <Gem size={16} />
                                棋子皮肤
                            </button>
                            <button 
                                onClick={() => setActiveTab('board')} 
                                className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 flex items-center justify-center gap-2 ${activeTab === 'board' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}
                            >
                                <Box size={16} />
                                棋盘主题
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
                    {activeTab === 'stone' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {stoneThemes.map(([id, theme]) => {
                                const isCurrent = currentStoneSkin === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => onSetStoneSkin(id)}
                                        className={`relative group cursor-pointer rounded-2xl p-4 border-3 transition-all duration-200 flex flex-col items-center gap-3 bg-white/80 ${
                                            isCurrent 
                                                ? 'border-[#5c4033] shadow-inner ring-4 ring-[#e3c086] scale-105' 
                                                : 'border-[#e3c086] hover:border-[#8c6b38] hover:shadow-xl hover:-translate-y-1'
                                        }`}
                                    >
                                        {/* Preview Area */}
                                        <div className="flex gap-3 justify-center items-center h-20 w-full rounded-xl bg-[#f5e6d3]/60 border-2 border-[#e3c086]">
                                            {/* Black Stone (Skeuomorphic Preview) */}
                                            <div 
                                                className="w-9 h-9 rounded-full shadow-lg relative"
                                                style={{ 
                                                    background: theme.blackColor, 
                                                    border: id === 'minimal' ? 'none' : `2px solid ${theme.blackBorder}`,
                                                    filter: theme.filter,
                                                    boxShadow: id === 'minimal' ? 
                                                        'inset 2px 2px 3px rgba(255,255,255,0.2), 1px 1px 2px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(0,0,0,0.5)' 
                                                        : undefined
                                                }}
                                            />
                                            {/* White Stone (Skeuomorphic Preview) */}
                                            <div 
                                                className="w-9 h-9 rounded-full shadow-lg relative"
                                                style={{ 
                                                    background: theme.whiteColor, 
                                                    border: id === 'minimal' ? 'none' : `2px solid ${theme.whiteBorder}`,
                                                    filter: theme.filter,
                                                    boxShadow: id === 'minimal' ? 
                                                        'inset 2px 2px 2px rgba(255,255,255,0.8), 1px 1px 2px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2)' 
                                                        : undefined
                                                }}
                                            />
                                        </div>
                                        
                                        {/* Name & Check */}
                                        <div className="flex justify-between items-center w-full px-1">
                                            <span className="font-bold text-[#5c4033] text-sm">{theme.name}</span>
                                            {isCurrent && (
                                                <div className="bg-green-500 text-white rounded-full p-1.5 shadow-md">
                                                    <Check size={14} strokeWidth={4}/>
                                                </div>
                                            )}
                                        </div>
                                        

                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'board' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {boardThemes.map(([id, theme]) => {
                                const isCurrent = currentBoardSkin === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => onSetBoardSkin(id)}
                                        className={`relative group cursor-pointer rounded-2xl p-4 border-3 transition-all duration-200 flex flex-col items-center gap-3 bg-white/80 ${
                                            isCurrent 
                                                ? 'border-[#5c4033] shadow-inner ring-4 ring-[#e3c086] scale-105' 
                                                : 'border-[#e3c086] hover:border-[#8c6b38] hover:shadow-xl hover:-translate-y-1'
                                        }`}
                                    >
                                        {/* Preview Area */}
                                        <div 
                                            className="w-full h-28 rounded-xl shadow-inner relative overflow-hidden border-2 border-[#e3c086]"
                                            style={{ background: theme.background }}
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
                                        
                                        {/* Name & Check */}
                                        <div className="flex justify-between items-center w-full px-1">
                                            <span className="font-bold text-[#5c4033] text-sm">{theme.name}</span>
                                            {isCurrent && (
                                                <div className="bg-green-500 text-white rounded-full p-1.5 shadow-md">
                                                    <Check size={14} strokeWidth={4}/>
                                                </div>
                                            )}
                                        </div>


                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
