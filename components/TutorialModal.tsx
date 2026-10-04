import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, ChevronLeft, BookOpen, CheckCircle2, RefreshCcw, LogOut } from 'lucide-react';
import { GameBoard } from './GameBoard';
import { calculateBoardConstants } from './board/geometry';
import { TutorialGuide, type TutorialDestination } from './TutorialGuide';
import type { TutorialContent } from './app/AppViewModel';

interface TutorialModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExplore?: (destination: TutorialDestination) => void;
    initialStepId?: string;
    tutorialContent: TutorialContent;
    vibrate: (pattern: number | number[]) => void;
    stoneAnimationEnabled?: boolean;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
    isOpen, onClose, onExplore, initialStepId, tutorialContent, vibrate, stoneAnimationEnabled = true,
}) => {
    const { TUTORIAL_STEPS, initTutorialStep, getTutorialHighlight,
        playTutorialPoint, countTutorialTerritory, passTutorialTurn } = tutorialContent;
    const initialIndex = Math.max(0, TUTORIAL_STEPS.findIndex(step => step.id === initialStepId));
    const [currentStep, setCurrentStep] = useState(initialIndex);
    const [session, setSession] = useState(() => initTutorialStep(initialIndex));
    const previousOpen = useRef(false);
    const previousInitialId = useRef(initialStepId);
    const { position, feedback, isCompleted, showQiOverride, territory } = session;
    const board = position.board;

    useEffect(() => {
        if (isOpen && (!previousOpen.current || previousInitialId.current !== initialStepId)) {
            setCurrentStep(initialIndex);
            setSession(initTutorialStep(initialIndex));
        }
        previousOpen.current = isOpen;
        previousInitialId.current = initialStepId;
    }, [isOpen, initialStepId, initialIndex, initTutorialStep]);

    const applyAction = (action: ReturnType<TutorialContent['playTutorialPoint']>) => {
        setSession(action.session);
        if (action.vibration !== undefined) vibrate(action.vibration);
    };
    const handleTerritoryCheck = () => applyAction(countTutorialTerritory(session));
    const handleBoardClick = (x: number, y: number) => applyAction(playTutorialPoint(session, { x, y }));
    const goToStep = (stepIndex: number) => {
        setCurrentStep(stepIndex);
        setSession(initTutorialStep(stepIndex));
    };
    const handleNext = () => {
        if (currentStep < TUTORIAL_STEPS.length - 1) goToStep(currentStep + 1);
        else onClose();
    };
    const handlePrev = () => { if (currentStep > 0) goToStep(currentStep - 1); };
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
        const highlight = getTutorialHighlight(session);
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
    }, [territory, board, session, getTutorialHighlight]);

    if (!isOpen) return null;

    const step = TUTORIAL_STEPS[currentStep];
    const isInfoPage = step.puzzleType === 'explore';
    const isGuide = step.puzzleType === 'zoom' || isInfoPage;

    // Determine if we should show the progress bar
    const showProgressBar = !((step.puzzleType === 'territory' && !isCompleted) || (step.puzzleType === 'endgame' && !isCompleted));

    return (
        <div role="dialog" aria-modal="true" aria-label="新手教学" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            {/* Window handles max dimensions via CSS */}
            <div className="bg-[#fcf6ea] w-full max-w-2xl landscape:max-w-full landscape:h-full rounded-3xl shadow-2xl border-4 border-[#e3c086] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200 h-auto max-h-[90vh] landscape:max-h-full min-h-[500px] landscape:min-h-0">

                {/* Header */}
                <div className="bg-[#e3c086]/20 p-4 landscape:p-2 flex items-center justify-between border-b border-[#e3c086]/30 shrink-0 h-16 landscape:h-12">
                    <div className="flex items-center gap-2 text-[#5c4033]">
                        <BookOpen size={20} className="shrink-0 landscape:w-5 landscape:h-5" />
                        <span className="font-bold text-sm sm:text-lg landscape:text-base whitespace-nowrap">新手教学 ({currentStep + 1}/{TUTORIAL_STEPS.length})</span>
                    </div>
                     <button
                        onClick={onClose}
                        className="flex shrink-0 items-center gap-2 whitespace-nowrap bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 sm:px-4 py-2 rounded-xl border-b-4 border-blue-300 active:border-b-0 active:translate-y-1 transition-all text-sm font-bold shadow-md"
                    >
                        <LogOut size={16} />
                        <span>{isInfoPage ? '完成' : '跳过'}</span>
                    </button>
                </div>

                {/* Content */}
                <div key={currentStep} className="flex flex-col md:flex-row landscape:flex-row flex-1 overflow-y-auto md:overflow-hidden landscape:overflow-hidden min-h-0">
                     {/* Text */}
                     <div className="p-6 md:p-6 landscape:p-4 space-y-4 shrink-0 md:overflow-y-auto landscape:overflow-y-auto md:w-1/3 landscape:w-1/3 md:border-r landscape:border-r border-[#e3c086]/20 flex flex-col justify-center">
                        <div className="flex justify-between items-start gap-2">
                             <h3 className="text-xl font-black text-[#5c4033] flex items-center gap-2">
                                {step.title}
                                {isCompleted && !isGuide && <CheckCircle2 size={24} className="text-green-500 animate-in zoom-in spin-in shrink-0" />}
                            </h3>
                        </div>
                        <p className="text-[#8c6b38] text-sm leading-relaxed font-medium whitespace-pre-wrap">
                            {feedback || (isInfoPage && !onExplore ? '基础规则就到这里。返回课程目录，继续学习下一项。' : step.content)}
                        </p>
                    </div>

                    {/* Board Area */}
                    <div className={`p-4 landscape:p-2 flex bg-[#f7e7ce]/30 relative ${isInfoPage ? 'flex-none md:flex-1 landscape:flex-1 min-h-0 md:overflow-y-auto landscape:overflow-y-auto' : 'flex-1 min-h-[300px] landscape:min-h-0 items-center justify-center overflow-hidden'}`}>
                        {isInfoPage ? (
                            <div className="m-auto w-full flex justify-center p-1 md:p-4 landscape:p-2">
                                {onExplore ? <TutorialGuide onExplore={destination => { onClose(); onExplore(destination); }} /> : (
                                    <button onClick={onClose} className="btn-retro btn-brown px-6 py-3 rounded-xl font-bold text-sm shadow-md">返回课程</button>
                                )}
                            </div>
                        ) : (
                        <div className="relative shadow-xl rounded-xl bg-[#e3c086] overflow-auto flex items-center justify-center transition-transform duration-300 w-full h-full transform md:scale-100 scale-95 landscape:scale-100" style={{ maxHeight: '100%', maxWidth: '100%' }}>
                             {/* Inner wrapper ensures centering */}
                             <div className="flex items-center justify-center h-full w-full">
                                <GameBoard
                                    key={currentStep}
                                    board={board}
                                    gameType="Go"
                                    showQi={showQiOverride}
                                    showCoordinates={false}
                                    stoneAnimationEnabled={stoneAnimationEnabled}
                                    currentPlayer={position.currentPlayer}
                                    lastMove={position.lastMove}
                                    onIntersectionClick={handleBoardClick}
                                    vibrate={vibrate}
                                    extraSVG={extraSVG}
                                />
                             </div>
                        </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 landscape:p-2 bg-[#fcf6ea] border-t border-[#e3c086]/30 flex items-center justify-between gap-3 shrink-0 h-20 landscape:h-14">
                    <button
                        onClick={handlePrev}
                        aria-label="上一页"
                        disabled={currentStep === 0}
                        className={`px-4 md:px-6 py-3 landscape:py-2 rounded-xl flex items-center gap-1 font-bold text-sm transition-all border-b-4 active:border-b-0 active:translate-y-1 ${
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
                            <div className="flex flex-wrap justify-center gap-1 items-center" aria-hidden="true">
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
                             onClick={() => applyAction(passTutorialTurn(session))}
                             className="btn-retro btn-brown px-6 py-3 rounded-xl font-bold text-sm shadow-md flex items-center gap-2"
                         >
                             停着
                             <span className="text-xs opacity-80">(Pass)</span>
                         </button>
                    ) : (
                        <button
                            onClick={currentStep === TUTORIAL_STEPS.length - 1 ? onClose : handleNext}
                            aria-label={currentStep === TUTORIAL_STEPS.length - 1 ? '完成' : '下一步'}
                            disabled={!isCompleted}
                            className={`px-4 md:px-6 py-3 landscape:py-2 rounded-xl font-bold text-sm shadow-md flex items-center gap-2 border-b-4 transition-all active:border-b-0 active:translate-y-1 ${
                                isCompleted
                                ? 'bg-[#5c4033] text-[#fcf6ea] border-[#3e2b22] hover:bg-[#4a332a]'
                                : 'bg-[#e3c086]/50 text-[#5c4033]/50 border-transparent cursor-not-allowed shadow-none'
                            }`}
                        >
                            <span className="hidden md:inline landscape:inline">{currentStep === TUTORIAL_STEPS.length - 1 ? '完成' : '下一步'}</span>
                            <ChevronRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
