import React, { useState, useEffect } from 'react';
import { X, Cpu, LayoutGrid, BarChart3, Wind, Volume2, VolumeX, Smartphone, RotateCcw, Palette } from 'lucide-react';
import { BoardSize, GameType, GameMode, Player, ExtendedDifficulty } from '../types';
import { getSliderBackground, getCalculatedVisits } from '../utils/helpers';
import { sliderToVisits, visitsToSlider } from '../hooks/useKataGo';


export interface GameSettingsData {
    boardSize: BoardSize;
    gameType: GameType;
    gameMode: GameMode;
    difficulty: ExtendedDifficulty;
    maxVisits: number;
    userColor: Player;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    
    // Current Game Settings (to init temp state)
    currentGameSettings: GameSettingsData;
    onApplyGameSettings: (newSettings: GameSettingsData) => void;

    // Visual Settings (Direct update)
    showQi: boolean;
    setShowQi: (val: boolean) => void;
    showWinRate: boolean;
    setShowWinRate: (val: boolean) => void;
    showCoordinates: boolean;
    setShowCoordinates: (val: boolean) => void;
    musicVolume: number;
    setMusicVolume: (val: number) => void;
    hapticEnabled: boolean;
    setHapticEnabled: (val: boolean) => void;
    vibrate: (pattern: number | number[]) => void;

    // Navigation
    onStartSetup: () => void;
    onOpenImport: () => void;
    onOpenOnline: () => void;
    onOpenAbout: () => void;
    onOpenTutorial: () => void;
    onOpenTsumego: () => void;
    onOpenSkinShop: () => void;
    
    isElectronAvailable: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    currentGameSettings,
    onApplyGameSettings,
    showQi, setShowQi,
    showWinRate, setShowWinRate,
    showCoordinates, setShowCoordinates,
    musicVolume, setMusicVolume,
    hapticEnabled, setHapticEnabled,
    vibrate,
    onStartSetup,
    onOpenImport,
    onOpenOnline,
    onOpenAbout,
    onOpenTutorial,
    onOpenTsumego,
    onOpenSkinShop,
    isElectronAvailable
}) => {
    // Temp State for Game Settings
    const [tempBoardSize, setTempBoardSize] = useState<BoardSize>(currentGameSettings.boardSize);
    const [tempGameType, setTempGameType] = useState<GameType>(currentGameSettings.gameType);
    const [tempGameMode, setTempGameMode] = useState<GameMode>(currentGameSettings.gameMode);
    const [tempDifficulty, setTempDifficulty] = useState<ExtendedDifficulty>(currentGameSettings.difficulty);
    const [tempMaxVisits, setTempMaxVisits] = useState<number>(currentGameSettings.maxVisits);
    const [tempUserColor, setTempUserColor] = useState<Player>(currentGameSettings.userColor);

    // Sync when opened
    useEffect(() => {
        if (isOpen) {
            setTempBoardSize(currentGameSettings.boardSize);
            setTempGameType(currentGameSettings.gameType);
            setTempGameMode(currentGameSettings.gameMode);
            
            // Auto-fix difficulty to Easy/Medium/Hard valid values
            let diff = currentGameSettings.difficulty;
            if (['Easy', 'Medium', 'Hard'].indexOf(diff) === -1) {
                diff = 'Easy';
            }
            
            setTempDifficulty(diff);
            setTempMaxVisits(currentGameSettings.maxVisits);
            setTempUserColor(currentGameSettings.userColor);
        }
    }, [isOpen, currentGameSettings]);

    if (!isOpen) return null;

    const handleDifficultySelect = (diff: ExtendedDifficulty) => {
        setTempDifficulty(diff);
        switch (diff) {
            case 'Easy': setTempMaxVisits(1); break;
            case 'Medium': setTempMaxVisits(10); break;
            case 'Hard': setTempMaxVisits(100); break;
        }
    };

    const handleCustomChange = (val: number) => {
        setTempMaxVisits(val);
        if (val !== 1 && val !== 10 && val !== 100) {
            setTempDifficulty('Custom');
        }
    };

    const handleApply = () => {
        onApplyGameSettings({
            boardSize: tempBoardSize,
            gameType: tempGameType,
            gameMode: tempGameMode,
            difficulty: tempDifficulty,
            maxVisits: tempMaxVisits,
            userColor: tempUserColor
        });
    };

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm landscape:max-w-3xl shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[90vh] overflow-hidden relative">
            
            {/* Header */}
            <div className="bg-[#fcf6ea] border-b-2 border-[#e3c086] border-dashed p-4 landscape:p-3 flex justify-between items-center shrink-0">
                <h2 className="text-2xl landscape:text-xl font-black text-[#5c4033] tracking-wide">游戏设置</h2>
                <button onClick={onClose} className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 landscape:p-4 overflow-y-auto custom-scrollbar flex flex-col landscape:grid landscape:grid-cols-2 gap-6 landscape:gap-x-6 landscape:gap-y-2">
                
                {/* LEFT COLUMN: Game Configuration */}
                <div className="space-y-4 landscape:contents">
                   <div className="space-y-4">
                        {/* 1. Game Config (Mode, Type, Color, Difficulty) */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">游戏模式</h3>
                            
                            {/* Game Type & Mode Toggles */}
                            <div className="space-y-4">
                                <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                                    <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${tempGameType === 'Gomoku' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                                    <button onClick={() => setTempGameType('Go')} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameType === 'Go' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>围棋</button>
                                    <button onClick={() => {
                                        setTempGameType('Gomoku');
                                        // Auto-fix difficulty if switching to Gomoku and current is Rank
                                        if (['Easy', 'Medium', 'Hard'].indexOf(tempDifficulty) === -1) {
                                            setTempDifficulty('Easy');
                                        }
                                    }} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameType === 'Gomoku' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>五子棋</button>
                                </div>

                                <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                                     <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${tempGameMode === 'PvAI' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                                    <button onClick={() => setTempGameMode('PvP')} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameMode === 'PvP' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>双人对战</button>
                                    <button onClick={() => setTempGameMode('PvAI')} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameMode === 'PvAI' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>挑战 AI</button>
                                </div>
                            </div>

                            {/* Player Color Selection (PvAI only) */}
                            {tempGameMode === 'PvAI' && (
                                <div className="flex gap-2 items-center bg-[#fff] p-2 rounded-xl border-2 border-[#e3c086] animate-in fade-in slide-in-from-top-2">
                                    <span className="text-xs font-bold text-[#8c6b38] px-2 shrink-0">我执:</span>
                                    <div className="flex-1 flex gap-2">
                                        <button onClick={() => setTempUserColor('black')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${tempUserColor === 'black' ? 'bg-[#5c4033] text-[#fcf6ea]' : 'bg-[#fcf6ea] text-[#5c4033]'}`}>
                                            <div className="w-3 h-3 rounded-full bg-black border border-gray-500"></div> 黑子
                                        </button>
                                        <button onClick={() => setTempUserColor('white')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${tempUserColor === 'white' ? 'bg-[#5c4033] text-[#fcf6ea]' : 'bg-[#fcf6ea] text-[#5c4033]'}`}>
                                            <div className="w-3 h-3 rounded-full bg-white border border-gray-400"></div> 白子
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Difficulty Selection (Unified for Go & Gomoku) */}
                            {tempGameMode === 'PvAI' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                     <div className="bg-[#fff]/50 p-3 rounded-2xl border border-[#e3c086] flex flex-col gap-3">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-sm font-bold text-[#5c4033] flex items-center gap-2">
                                                <Cpu size={16} className="text-[#8c6b38]"/> 
                                                {tempGameType === 'Go' && isElectronAvailable ? '难度预设' : 'AI 难度'}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {(['Easy', 'Medium', 'Hard'] as const).map(diff => (
                                                <button
                                                    key={diff}
                                                    onClick={() => handleDifficultySelect(diff)}
                                                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border-2 ${
                                                        tempDifficulty === diff 
                                                        ? 'bg-[#8c6b38] text-[#fcf6ea] border-[#5c4033] shadow-inner' 
                                                        : 'bg-[#fff] text-[#8c6b38] border-[#e3c086] hover:bg-[#fcf6ea]'
                                                    }`}
                                                >
                                                    {diff === 'Easy' ? '简单' : diff === 'Medium' ? '中等' : '困难'}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Electron: Thinking Amount Slider */}
                                        {tempGameType === 'Go' && isElectronAvailable && (
                                            <div className="pt-2 border-t border-[#e3c086]/30 flex flex-col gap-2">
                                                <div className="flex justify-between items-center px-1">
                                                    <span className="text-xs font-bold text-[#8c6b38] flex items-center gap-1">
                                                        <Wind size={14}/> 思考量 (模拟数)
                                                    </span>
                                                    <span className="text-xs font-black text-[#5c4033] bg-[#e3c086]/30 px-2 py-0.5 rounded-md">
                                                        {tempMaxVisits}
                                                    </span>
                                                </div>
                                                <div className="relative h-8 flex items-center px-2">
                                                    <input 
                                                        type="range" min="0" max="100" step="1" 
                                                        value={visitsToSlider(tempMaxVisits)}
                                                        onChange={(e) => handleCustomChange(sliderToVisits(parseFloat(e.target.value)))}
                                                        className="cute-range w-full"
                                                        style={{ 
                                                            background: getSliderBackground(visitsToSlider(tempMaxVisits), 0, 100), 
                                                            touchAction: 'none'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Board Size Slider */}
                        <div className="bg-[#fff]/50 p-3 rounded-2xl border border-[#e3c086] flex flex-col gap-3">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-sm font-bold text-[#5c4033] flex items-center gap-2">
                                    <LayoutGrid size={16} className="text-[#8c6b38]"/> 棋盘大小
                                </span>
                                <span className="text-xs font-black text-[#fcf6ea] bg-[#8c6b38] px-2 py-0.5 rounded-md shadow-sm">
                                    {tempBoardSize} 路
                                </span>
                            </div>
                            
                            <div className="relative h-8 flex items-center px-2">
                                 <input 
                                    type="range" min="4" max="19" step="1"
                                    value={tempBoardSize} 
                                    onChange={(e) => setTempBoardSize(parseInt(e.target.value))}
                                    className="cute-range w-full"
                                    style={{ 
                                        background: getSliderBackground(tempBoardSize, 4, 19),
                                        touchAction: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50 landscape:hidden"></div>
                   </div>
                </div>

                {/* RIGHT COLUMN: Visual & Tools */}
                <div className="space-y-4">
                    {/* 2. Visual & Audio */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">辅助与音效</h3>
                        
                        <div className="flex gap-2 justify-between">
                            <button onClick={() => setShowWinRate(!showWinRate)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showWinRate ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                                <BarChart3 size={18} />
                                <span className="text-xs font-bold">胜率</span>
                            </button>
                            <button onClick={() => setShowCoordinates(!showCoordinates)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showCoordinates ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                                <LayoutGrid size={18} />
                                <span className="text-xs font-bold">坐标</span>
                            </button>
                            <button onClick={() => setShowQi(!showQi)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showQi ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                                <Wind size={18} />
                                <span className="text-xs font-bold">气</span>
                            </button>
                        </div>

                        {/* Skin Shop Button */}
                        <button 
                            onClick={() => { onOpenSkinShop(); onClose(); }}
                            className="btn-retro bg-[#fff] border-[#e3c086] text-[#8c6b38] hover:text-[#5c4033] hover:border-[#8c6b38] w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all"
                        >
                            <Palette size={18} />
                            <span className="text-sm">外观商店</span>
                        </button>

                        <div className="flex gap-3">
                             {/* Volume Control */}
                            <div className="flex-[2] flex items-center gap-3 bg-[#fff] px-3 py-2 rounded-2xl border-2 border-[#e3c086]">
                                <button onClick={() => setMusicVolume(musicVolume > 0 ? 0 : 0.3)} className="text-[#8c6b38] shrink-0">
                                    {musicVolume > 0 ? <Volume2 size={20}/> : <VolumeX size={20}/>}
                                </button>
                                <div className="flex-grow max-w-[120px]">
                                    <input 
                                        type="range" min="0" max="1" step="0.1" 
                                        value={musicVolume} 
                                        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                        className="cute-range w-full"
                                        style={{ 
                                            background: getSliderBackground(musicVolume, 0, 1),
                                            touchAction: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Haptic Toggle */}
                            <button 
                                onClick={() => { setHapticEnabled(!hapticEnabled); vibrate(10); }}
                                className={`flex-1 btn-retro rounded-xl border-2 flex items-center justify-center gap-2 ${hapticEnabled ? 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]' : 'bg-[#fff] text-[#d7ccc8] border-[#e0e0e0]'}`}
                            >
                                <Smartphone size={18} className={hapticEnabled ? 'animate-pulse' : ''}/>
                                <span className="text-xs font-bold">振动</span>
                            </button>
                        </div>
                    </div>


                </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 landscape:p-2 bg-[#fcf6ea] border-t-2 border-[#e3c086] flex flex-col gap-2 shrink-0 col-span-2">
                 <button 
                    onClick={handleApply}
                    className="btn-retro btn-brown w-full py-3 landscape:py-2 rounded-xl font-black tracking-wider flex items-center justify-center gap-2 text-base landscape:text-sm"
                >
                    <RotateCcw size={18} /> 应用设置并重新开始
                </button>
            </div>

          </div>
        </div>
    );
};
