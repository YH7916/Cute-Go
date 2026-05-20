import React, { useState, useEffect } from 'react';
import { X, Cpu, LayoutGrid, BarChart3, Wind, Volume2, VolumeX, Smartphone, RotateCcw, Palette, FileUp, Home, CircleDot } from 'lucide-react';
import { BoardSize, GameType, GameMode, Player, Difficulty } from '../types';
import { getSliderBackground } from '../utils/helpers';

type PlayStyle = 'PvP' | 'Fun' | 'PvAI';

export interface GameSettingsData {
    boardSize: BoardSize;
    gameType: GameType;
    gameMode: GameMode;
    difficulty: Difficulty;
    userColor: Player;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentGameSettings: GameSettingsData;
    onApplyGameSettings: (newSettings: GameSettingsData) => void;
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
    skipStartScreen: boolean;
    setSkipStartScreen: (val: boolean) => void;
    separatePieces: boolean;
    setSeparatePieces: (val: boolean) => void;
    onStartSetup: () => void;
    onOpenImport: () => void;
    onOpenOnline: () => void;
    onOpenAbout: () => void;
    onOpenTutorial: () => void;
    onOpenTsumego: () => void;
    onOpenSkinShop: () => void;
}

const getPlayStyle = (settings: GameSettingsData): PlayStyle => {
    if (settings.gameMode === 'PvAI' && settings.gameType === 'Go' && settings.difficulty === 'Fun') return 'Fun';
    if (settings.gameMode === 'PvAI') return 'PvAI';
    return 'PvP';
};

const getChallengeDifficulty = (difficulty: Difficulty): Difficulty =>
    difficulty === 'Fun' ? 'Easy' : difficulty;

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
    skipStartScreen, setSkipStartScreen,
    separatePieces, setSeparatePieces,
    onOpenImport,
    onOpenSkinShop
}) => {
    const [tempBoardSize, setTempBoardSize] = useState<BoardSize>(currentGameSettings.boardSize);
    const [tempPlayStyle, setTempPlayStyle] = useState<PlayStyle>(() => getPlayStyle(currentGameSettings));
    const [tempDifficulty, setTempDifficulty] = useState<Difficulty>(() => getChallengeDifficulty(currentGameSettings.difficulty));
    const [tempUserColor, setTempUserColor] = useState<Player>(currentGameSettings.userColor);

    useEffect(() => {
        if (!isOpen) return;
        setTempBoardSize(currentGameSettings.boardSize);
        setTempPlayStyle(getPlayStyle(currentGameSettings));
        setTempDifficulty(getChallengeDifficulty(currentGameSettings.difficulty));
        setTempUserColor(currentGameSettings.userColor);
    }, [isOpen, currentGameSettings]);

    if (!isOpen) return null;

    const isGomokuSettings = currentGameSettings.gameType === 'Gomoku';
    const isGoSettings = currentGameSettings.gameType === 'Go';
    const playStyleOptions: { value: PlayStyle; label: string }[] = isGoSettings
        ? [
            { value: 'PvP', label: '双人' },
            { value: 'Fun', label: '娱乐' },
            { value: 'PvAI', label: '人机' },
        ]
        : [
            { value: 'PvP', label: '双人' },
            { value: 'PvAI', label: '人机' },
        ];
    const selectedPlayStyleIndex = Math.max(0, playStyleOptions.findIndex(option => option.value === tempPlayStyle));
    const isFunGoSettings =
        isGoSettings &&
        tempPlayStyle === 'Fun';
    const isAiSettings = tempPlayStyle !== 'PvP';
    const isChallengeGoSettings =
        isGoSettings &&
        tempPlayStyle === 'PvAI';
    const title = isGomokuSettings
        ? '五子棋设置'
        : isFunGoSettings
            ? '围棋娱乐设置'
            : isChallengeGoSettings
                ? '挑战 AI 设置'
                : '围棋设置';
    const showAiDifficulty = tempPlayStyle === 'PvAI';
    const showWinRateSetting = isChallengeGoSettings;
    const showGoOnlyAssist = isGoSettings;
    const showImportExport = isGoSettings;

    const handlePlayStyleChange = (style: PlayStyle) => {
        setTempPlayStyle(style);
        if (style === 'PvAI') setTempDifficulty(prev => getChallengeDifficulty(prev));
    };

    const handleApply = () => {
        onApplyGameSettings({
            boardSize: tempBoardSize,
            gameType: currentGameSettings.gameType,
            gameMode: tempPlayStyle === 'PvP' ? 'PvP' : 'PvAI',
            difficulty: tempPlayStyle === 'Fun' ? 'Fun' : getChallengeDifficulty(tempDifficulty),
            userColor: tempUserColor
        });
    };

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm landscape:max-w-3xl shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[90vh] overflow-hidden relative">
            <div className="bg-[#fcf6ea] border-b-2 border-[#e3c086] border-dashed p-4 landscape:p-3 flex justify-between items-center shrink-0">
                <h2 className="text-2xl landscape:text-xl font-black text-[#5c4033] tracking-wide">{title}</h2>
                <button onClick={onClose} className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 landscape:p-4 overflow-y-auto custom-scrollbar flex flex-col landscape:grid landscape:grid-cols-2 gap-6 landscape:gap-x-6 landscape:gap-y-2">
                <div className="space-y-4 landscape:contents">
                   <div className="space-y-4">
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">对局设置</h3>

                            <div className="space-y-4">
                                <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                                    <div
                                        className={`absolute top-1 bottom-1 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${
                                            playStyleOptions.length === 3
                                                ? 'left-1'
                                                : selectedPlayStyleIndex === 1
                                                    ? 'w-1/2 translate-x-full left-[-2px]'
                                                    : 'w-1/2 left-1'
                                        }`}
                                        style={playStyleOptions.length === 3
                                            ? {
                                                width: 'calc((100% - 0.5rem) / 3)',
                                                transform: `translateX(${selectedPlayStyleIndex * 100}%)`,
                                            }
                                            : undefined
                                        }
                                    />
                                    {playStyleOptions.map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => handlePlayStyleChange(option.value)}
                                            className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 flex items-center justify-center ${
                                                tempPlayStyle === option.value
                                                ? 'text-[#5c4033]'
                                                : 'text-[#8c6b38]/70 hover:text-[#5c4033]'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isAiSettings && (
                                <div className="flex gap-2 items-center bg-[#fff] p-2 rounded-xl border-2 border-[#e3c086] animate-in fade-in slide-in-from-top-2">
                                    <span className="text-xs font-bold text-[#8c6b38] px-2 shrink-0">我执:</span>
                                    <div className="flex-1 flex gap-2">
                                        <button onClick={() => setTempUserColor('black')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${tempUserColor === 'black' ? 'bg-[#5c4033] text-[#fcf6ea]' : 'bg-[#fcf6ea] text-[#5c4033]'}`}>
                                            <div className="w-3 h-3 rounded-full bg-black"></div> 黑子
                                        </button>
                                        <button onClick={() => setTempUserColor('white')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${tempUserColor === 'white' ? 'bg-[#5c4033] text-[#fcf6ea]' : 'bg-[#fcf6ea] text-[#5c4033]'}`}>
                                            <div className="w-3 h-3 rounded-full bg-white border border-gray-400"></div> 白子
                                        </button>
                                    </div>
                                </div>
                            )}

                            {showAiDifficulty && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                     <div className="bg-[#fff]/50 p-3 rounded-2xl border-2 border-[#e3c086] flex flex-col gap-3">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-sm font-bold text-[#5c4033] flex items-center gap-2">
                                                <Cpu size={16} className="text-[#8c6b38]"/>
                                                {currentGameSettings.gameType === 'Go' ? '围棋 AI 难度' : '五子棋 AI 难度'}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {(['Easy', 'Medium', 'Hard'] as const).map(diff => (
                                                <button
                                                    key={diff}
                                                    onClick={() => setTempDifficulty(diff)}
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
                                    </div>
                                </div>
                            )}

                        </div>

                        <div className="bg-[#fff]/50 p-3 rounded-2xl border-2 border-[#e3c086] flex flex-col gap-3">
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
                                    type="range" min="5" max="19" step="1"
                                    value={tempBoardSize}
                                    onChange={(e) => setTempBoardSize(parseInt(e.target.value))}
                                    className="cute-range w-full"
                                    style={{
                                        background: getSliderBackground(tempBoardSize, 5, 19),
                                        touchAction: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50 landscape:hidden"></div>
                   </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">辅助与音效</h3>

                        <div className="flex gap-2 justify-between">
                            {showWinRateSetting && (
                                <button onClick={() => setShowWinRate(!showWinRate)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showWinRate ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                                    <BarChart3 size={18} />
                                    <span className="text-xs font-bold">胜率</span>
                                </button>
                            )}
                            <button onClick={() => setShowCoordinates(!showCoordinates)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showCoordinates ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                                <LayoutGrid size={18} />
                                <span className="text-xs font-bold">坐标</span>
                            </button>
                            {showGoOnlyAssist && (
                                <button onClick={() => setShowQi(!showQi)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showQi ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                                    <Wind size={18} />
                                    <span className="text-xs font-bold">气</span>
                                </button>
                            )}
                            {showGoOnlyAssist && (
                                <button onClick={() => setSeparatePieces(!separatePieces)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${separatePieces ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                                    <CircleDot size={18} />
                                    <span className="text-xs font-bold">独立</span>
                                </button>
                            )}
                        </div>

                        {showImportExport && (
                            <button
                                onClick={() => { onOpenImport(); onClose(); }}
                                className="btn-retro bg-[#fff] border-[#e3c086] text-[#8c6b38] hover:text-[#5c4033] hover:border-[#8c6b38] w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all"
                            >
                                <FileUp size={18} />
                                <span className="text-sm">导入 / 导出棋谱</span>
                            </button>
                        )}

                        <button
                            onClick={() => { onOpenSkinShop(); onClose(); }}
                            className="btn-retro bg-[#fff] border-[#e3c086] text-[#8c6b38] hover:text-[#5c4033] hover:border-[#8c6b38] w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all"
                        >
                            <Palette size={18} />
                            <span className="text-sm">外观商店</span>
                        </button>

                        <div className="flex gap-3">
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

                            <button
                                onClick={() => { setHapticEnabled(!hapticEnabled); vibrate(10); }}
                                className={`flex-1 btn-retro rounded-xl border-2 flex items-center justify-center gap-2 ${hapticEnabled ? 'bg-[#e3c086] text-[#5c4033] border-[#b88742]' : 'bg-[#fff] text-[#d7ccc8] border-[#e0e0e0]'}`}
                            >
                                <Smartphone size={18} className={hapticEnabled ? 'animate-pulse' : ''}/>
                                <span className="text-xs font-bold">振动</span>
                            </button>
                        </div>

                        <button
                            onClick={() => setSkipStartScreen(!skipStartScreen)}
                            className={`btn-retro w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${skipStartScreen ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38] hover:text-[#5c4033] hover:border-[#8c6b38]'}`}
                        >
                            <Home size={18} />
                            <span className="text-sm">{skipStartScreen ? '开局直接进游戏 ✓' : '开局显示主页'}</span>
                        </button>
                    </div>
                </div>
            </div>

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
