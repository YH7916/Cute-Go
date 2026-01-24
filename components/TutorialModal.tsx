import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, BookOpen, CheckCircle2, RefreshCcw, LogOut } from 'lucide-react';
import { GameBoard, calculateBoardConstants } from './GameBoard';
import { createBoard, calculateTerritory } from '../utils/goLogic';
import { BoardState } from '../types';

interface TutorialModalProps {
    isOpen: boolean;
    onClose: () => void;
}

import { TUTORIAL_STEPS, initTutorialStep, getTutorialHighlight } from './TutorialStates';

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [board, setBoard] = useState<BoardState>(createBoard(9));
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isCompleted, setIsCompleted] = useState(false);
    const [showQiOverride, setShowQiOverride] = useState(false);
    const [qiFocus, setQiFocus] = useState<{x:number, y:number} | undefined>(undefined);
    
    // Territory Overlay State
    const [territory, setTerritory] = useState<{black: {x:number, y:number}[], white: {x:number, y:number}[]} | null>(null);

    // Initialization per step
    useEffect(() => {
        if (!isOpen) return;
        initStep(currentStep);
    }, [currentStep, isOpen]);

    const initStep = (stepIdx: number) => {
        const { board: newBoard, showQiOverride: newShowQi, qiFocus: newFocus, isCompleted: newCompleted } = initTutorialStep(stepIdx);
        
        setBoard(newBoard);
        setFeedback(null);
        setIsCompleted(newCompleted);
        setTerritory(null);
        setShowQiOverride(newShowQi);
        setQiFocus(newFocus);
    };

    const handleTerritoryCheck = () => {
         const terr = calculateTerritory(board);
         setTerritory(terr);
         setIsCompleted(true);
         setFeedback("黑棋地盘明显更多，黑胜！这就是计算地盘。");
         if (navigator.vibrate) navigator.vibrate(20);
    };

    const handleBoardClick = (x: number, y: number) => {
        if (territory && (TUTORIAL_STEPS[currentStep].puzzleType === 'territory' || TUTORIAL_STEPS[currentStep].puzzleType === 'endgame')) return; 

        const type = TUTORIAL_STEPS[currentStep].puzzleType;
        const newBoard = board.map(r => r.map(s => s));

        if (type === 'qi' || type === 'connection') {
             // NO-OP
        }
        else if (type === 'capture') {
            const size = board.length;
            const center = Math.floor(size/2);
            if (x === center && y === center + 1) {
                newBoard[y][x] = { x, y, color: 'black', id: `move-${Date.now()}` };
                newBoard[center][center] = null;
                setBoard(newBoard);
                setFeedback("太棒了！只有一口气的时候，堵住它就能吃掉！");
                if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
                setIsCompleted(true);
            } else {
                setFeedback("不对哦，请点击发光的圆圈处，那里是白棋唯一的活路。");
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }
        else if (type === 'forbidden') {
            const size = board.length;
            const center = Math.floor(size/2);
            if (x === center && y === center) {
                 setFeedback("警告！这里是禁入点（Suicide）。落子会立即没气，依规则不能下在这里！");
                 if (navigator.vibrate) navigator.vibrate(200);
                 // We let them "pass" after trying
                 setIsCompleted(true);
            } else {
                 setFeedback("请试着点击那个被黑棋包围的中心点（禁入点）。");
            }
        }
        else if (type === 'ko') {
            // Target 8,4
            if (x===8 && y===4) {
                 newBoard[y][x] = { x, y, color: 'black', id: `move-${Date.now()}` };
                 newBoard[3][8] = null; // Capture Victim at 8,3
                 setBoard(newBoard);
                 setFeedback("提掉了！但注意：黑子现在只剩一口气，白棋如果立即回提，局面就重复了，所以必须“找劫材”。");
                 setIsCompleted(true);
                 if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
            } else {
                 setFeedback("请提掉那颗白子（高亮处）！");
            }
        }
        else if (type === 'eyes') {
            // Target 4,4
            if (x===4 && y===4) {
                 newBoard[y][x] = { x, y, color: 'black', id: `move-${Date.now()}` };
                 setBoard(newBoard);
                 setFeedback("活了！两个眼位（3-3和4-5区域）确立，黑棋已经“做活”。");
                 setIsCompleted(true);
                 if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
            } else {
                 setFeedback("请下在两块空地的连接点（4,4），制造两只眼！");
            }
        }
        else if (type === 'final_shape') {
            // Step 1: Star Point (2,2) or (2,6) or (6,2-occupied) or (6,6)
            // Allow any valid star point that's empty
            const isStarPoint = (x===2 || x===6) && (y===2 || y===6);
            
            // Check if we already have a black stone (Move 1 done)
            let moves = 0;
            let lastMove = null;
            board.forEach(r => r.forEach(s => { if(s?.color==='black' && s.id.startsWith('move')) { moves++; lastMove=s; } }));
            
            if (moves === 0) {
                if (isStarPoint && !board[y][x]) {
                     newBoard[y][x] = { x, y, color: 'black', id: `move-1` };
                     setBoard(newBoard);
                     setFeedback("好！占据了角部星位。下一步，我们走“小飞”守角（高亮处, 4-3），巩固地盘。");
                } else {
                     setFeedback("请下在角上的星位（高亮圆圈）。");
                }
            } else if (moves === 1) {
                // Enforce proper Small Knight from 2,2 (assumed for tut)
                if (x === 4 && y === 3) {
                     newBoard[y][x] = { x, y, color: 'black', id: `move-2` };
                     setBoard(newBoard);
                     setFeedback("完美！这就是“小飞守角”。两步棋配合，角地就更稳固了。");
                     setIsCompleted(true);
                     if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
                } else {
                     setFeedback("请点击高亮显示的位置（4,3），完成小飞守角。");
                }
            }
        }
    };

    const handleNext = () => {
        if (currentStep < TUTORIAL_STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    // Extra SVG for overlay (Heatmap / Arrows / Highlights)
    const extraSVG = useMemo(() => {
        const size = board.length;
        // USE SHARED LOGIC!
        const { CELL_SIZE, GRID_PADDING } = calculateBoardConstants(size, false);

        // Highlight Color: White Gold Flash
        const HL_COLOR = "#FFD700"; 
        const HL_INNER = "#FFFFFF";

        // Helper for Highlight: Flash / Blinking (No Ripple)
        const renderHighlight = (bx: number, by: number) => (
             <g key={`hl-${bx}-${by}`}>
                 {/* Outer Glow */}
                 <circle 
                    cx={GRID_PADDING + bx * CELL_SIZE} 
                    cy={GRID_PADDING + by * CELL_SIZE} 
                    r={CELL_SIZE * 0.4} 
                    fill={HL_COLOR}
                >
                    <animate attributeName="opacity" values="0;0.5;0" dur="1.2s" repeatCount="indefinite" />
                </circle>
                
                {/* Inner Bright Core */}
                <circle 
                    cx={GRID_PADDING + bx * CELL_SIZE} 
                    cy={GRID_PADDING + by * CELL_SIZE} 
                    r={CELL_SIZE * 0.2} 
                    fill={HL_INNER}
                    stroke={HL_COLOR}
                    strokeWidth="2"
                >
                    <animate attributeName="opacity" values="0.6;1;0.6" dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="r" values={`${CELL_SIZE*0.2};${CELL_SIZE*0.25};${CELL_SIZE*0.2}`} dur="1.2s" repeatCount="indefinite" />
                </circle>
             </g>
        );

        // Clue Highlighting
        const highlight = getTutorialHighlight(currentStep, isCompleted, board);
        if (highlight) {
            return <g>{renderHighlight(highlight.x, highlight.y)}</g>;
        }
        if (territory) {
             return (
                 <g>
                     {territory.black.map(p => (
                         <rect key={`tb-${p.x}-${p.y}`} 
                             x={GRID_PADDING + p.x * CELL_SIZE - CELL_SIZE/2 + 2} 
                             y={GRID_PADDING + p.y * CELL_SIZE - CELL_SIZE/2 + 2} 
                             width={CELL_SIZE-4} height={CELL_SIZE-4} 
                             fill="#000" opacity="0.3" rx="4"
                         />
                     ))}
                     {territory.white.map(p => (
                         <rect key={`tw-${p.x}-${p.y}`} 
                             x={GRID_PADDING + p.x * CELL_SIZE - CELL_SIZE/2 + 2} 
                             y={GRID_PADDING + p.y * CELL_SIZE - CELL_SIZE/2 + 2} 
                             width={CELL_SIZE-4} height={CELL_SIZE-4} 
                             fill="#fff" opacity="0.3" rx="4"
                         />
                     ))}
                 </g>
             );
        }
        return null;
    }, [territory, board, currentStep, isCompleted]);

    if (!isOpen) return null;

    const step = TUTORIAL_STEPS[currentStep];

    // Determine if we should show the progress bar
    const showProgressBar = !((step.puzzleType === 'territory' && !isCompleted) || (step.puzzleType === 'endgame' && !isCompleted));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            {/* Window handles max dimensions via CSS */}
            <div className="bg-[#fcf6ea] w-full max-w-2xl landscape:max-w-full landscape:h-full rounded-3xl shadow-2xl border-4 border-[#e3c086] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200 h-auto max-h-[90vh] landscape:max-h-full min-h-[500px] landscape:min-h-0">
                
                {/* Header */}
                <div className="bg-[#e3c086]/20 p-4 landscape:p-2 flex items-center justify-between border-b border-[#e3c086]/30 shrink-0 h-16 landscape:h-12">
                    <div className="flex items-center gap-2 text-[#5c4033]">
                        <BookOpen size={20} className="landscape:w-5 landscape:h-5" />
                        <span className="font-bold text-lg landscape:text-base">新手教学 ({currentStep + 1}/{TUTORIAL_STEPS.length})</span>
                    </div>
                     <button 
                        onClick={onClose} 
                        className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-800 px-4 py-2 rounded-xl border-b-4 border-blue-300 active:border-b-0 active:translate-y-1 transition-all text-sm font-bold shadow-md"
                    >
                        <LogOut size={16} />
                        <span>跳过</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-col md:flex-row landscape:flex-row flex-1 overflow-hidden min-h-0">
                     {/* Text */}
                     <div className="p-6 md:p-6 landscape:p-4 space-y-4 shrink-0 overflow-y-auto md:w-1/3 landscape:w-1/3 md:border-r landscape:border-r border-[#e3c086]/20 flex flex-col justify-center">
                        <div className="flex justify-between items-start gap-2">
                             <h3 className="text-xl font-black text-[#5c4033] flex items-center gap-2">
                                {step.title}
                                {isCompleted && <CheckCircle2 size={24} className="text-green-500 animate-in zoom-in spin-in shrink-0" />}
                            </h3>
                        </div>
                        <p className="text-[#8c6b38] text-sm leading-relaxed font-medium whitespace-pre-wrap">
                            {feedback || step.content}
                        </p>
                    </div>

                    {/* Board Area */}
                    <div className="flex-1 min-h-[300px] landscape:min-h-0 p-4 landscape:p-2 flex items-center justify-center bg-[#f7e7ce]/30 overflow-hidden relative">
                         {/* Responsive Container: Same as before, natural flow */}
                        <div className="relative shadow-xl rounded-xl bg-[#e3c086] overflow-auto flex items-center justify-center transition-transform duration-300 w-full h-full transform md:scale-100 scale-95 landscape:scale-100" style={{ maxHeight: '100%', maxWidth: '100%' }}>
                             {/* Inner wrapper ensures centering */}
                             <div className="flex items-center justify-center h-full w-full">
                                <GameBoard 
                                    board={board}
                                    gameType="Go"
                                    showQi={showQiOverride} 
                                    showCoordinates={false}
                                    currentPlayer="black"
                                    lastMove={null}
                                    onIntersectionClick={handleBoardClick}
                                    extraSVG={extraSVG}
                                />
                             </div>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 landscape:p-2 bg-[#fcf6ea] border-t border-[#e3c086]/30 flex items-center justify-between gap-3 shrink-0 h-20 landscape:h-14">
                    <button 
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className={`px-6 py-3 landscape:py-2 rounded-xl flex items-center gap-1 font-bold text-sm transition-all border-b-4 active:border-b-0 active:translate-y-1 ${
                            currentStep === 0 
                                ? 'bg-[#e3c086]/20 text-[#8c6b38]/30 border-transparent cursor-not-allowed shadow-none' 
                                : 'bg-[#fff] text-[#8c6b38] border-[#e3c086] hover:bg-[#fff]/80'
                        }`}
                    >
                        <ChevronLeft size={18} />
                        <span className="hidden md:inline landscape:inline">上一页</span>
                    </button>

                    {showProgressBar && (
                        <div className="flex gap-2 flex-1 justify-center">
                            {/* Dots */}
                            <div className="flex gap-1 items-center">
                                {TUTORIAL_STEPS.map((_, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`h-2 rounded-full transition-all duration-300 ${
                                            idx === currentStep ? 'w-6 bg-[#5c4033]' : 'w-2 bg-[#e3c086]/50'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                     {/* Right Action Button Logic: Territory Button MOVED HERE */}
                    {step.puzzleType === 'territory' && !isCompleted ? (
                         <button 
                            onClick={handleTerritoryCheck}
                            className="bg-[#81d4fa] text-[#0277bd] border-b-4 border-[#29b6f6] px-6 py-3 rounded-xl font-bold text-sm shadow-sm active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2"
                        >
                            计算地盘
                            <RefreshCcw size={18} />
                        </button>
                    ) : step.puzzleType === 'endgame' && !isCompleted ? (
                         <button 
                             onClick={() => { 
                                 // Auto-advance logic
                                 if(navigator.vibrate) navigator.vibrate(20); 
                                 handleNext();
                             }}
                             className="btn-retro btn-brown px-6 py-3 rounded-xl font-bold text-sm shadow-md flex items-center gap-2"
                         >
                             停着
                             <span className="text-xs opacity-80">(Pass)</span>
                         </button>
                    ) : (
                        <button 
                            onClick={currentStep === TUTORIAL_STEPS.length - 1 ? onClose : handleNext}
                            disabled={!isCompleted}
                            className={`px-6 py-3 landscape:py-2 rounded-xl font-bold text-sm shadow-md flex items-center gap-2 border-b-4 transition-all active:border-b-0 active:translate-y-1 ${
                                isCompleted 
                                ? 'bg-[#5c4033] text-[#fcf6ea] border-[#3e2b22] hover:bg-[#4a332a]'
                                : 'bg-[#e3c086]/50 text-[#5c4033]/50 border-transparent cursor-not-allowed shadow-none'
                            }`}
                        >
                            <span className="hidden md:inline landscape:inline">{currentStep === TUTORIAL_STEPS.length - 1 ? '开始下棋' : '下一步'}</span>
                            <ChevronRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
