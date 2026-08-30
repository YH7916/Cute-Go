
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    calculateScore,
    calculateModelScore,
    cleanBoardWithTerritory, // [New]
} from './utils/goLogic';

// Hooks
import { useWebKataGo } from './hooks/useWebKataGo';
import { useAchievements } from './hooks/useAchievements';
import { useAppSettings } from './hooks/useAppSettings';
import { useGameState } from './hooks/useGameState';
import { useGameActions } from './hooks/useGameActions';
import { useGameFlow } from './hooks/useGameFlow';
import { useAudio } from './hooks/useAudio';
import { useApplySettingsFlow } from './hooks/useApplySettingsFlow';
import { useAppAuthProfile } from './hooks/useAppAuthProfile';
import { useImportExportFlow } from './hooks/useImportExportFlow';
import { useOnlineMatch } from './hooks/useOnlineMatch';
import { useStartGameFlow } from './hooks/useStartGameFlow';
import { useTsumego } from './domains/tsumego/useTsumego';
import { useTsumegoFlow } from './domains/tsumego/useTsumegoFlow';
import { useTsumegoNavigation } from './domains/tsumego/useTsumegoNavigation';

// Utils
import { Player, GameMode } from './types';

import { AppView } from './components/AppView';

const App: React.FC = () => {
    // --- Hooks ---
    const settings = useAppSettings();
    const gameState = useGameState(settings.boardSize);
    const { playSfx, vibrate } = useAudio(settings.musicVolume, settings.hapticEnabled);

    // --- Local UI State ---
    const [showMenu, setShowMenu] = useState(false);
    const [showUserPage, setShowUserPage] = useState(false);
    const [showPassModal, setShowPassModal] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showTsumegoList, setShowTsumegoList] = useState(false); // [New] Tsumego Modal
    const [isThinking, setIsThinking] = useState(false);
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    // Auto-dismiss toast after 3 seconds
    useEffect(() => {
        if (toastMsg) {
            const timer = setTimeout(() => {
                setToastMsg(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toastMsg]);

    const {
        completedLevelIds,
        setCompletedLevelIds,
        showTsumegoLevelSelector,
        setShowTsumegoLevelSelector,
        currentTsumegoLevel,
        setCurrentTsumegoLevel,
        tsumegoRoot,
        setTsumegoRoot,
        tsumegoCurrentNode,
        setTsumegoCurrentNode,
        tsumegoCollection,
        setTsumegoCollection,
        tsumegoSetTitle,
        setTsumegoSetTitle,
        tsumegoCategories,
        showTsumegoResult,
        setShowTsumegoResult,
        tsumegoIsCorrect,
        setTsumegoIsCorrect,
        tsumegoResultMsg,
        setTsumegoResultMsg,
        setTsumegoInstruction,
        getTsumegoFileList,
    } = useTsumegoFlow();
    const [showStartScreen, setShowStartScreen] = useState(!settings.skipStartScreen);
    const [showSkinShop, setShowSkinShop] = useState(false);

    // Ref to break circular dependency between executeMove and handleTsumegoMove
    const handleTsumegoMoveRef = useRef<(x: number, y: number) => boolean>(() => false);

    // --- Tutorial Init Check ---
    useEffect(() => {
        const hasSeen = localStorage.getItem('cute_go_tutorial_seen');
        if (!hasSeen) {
            setShowTutorial(true);
        }
    }, []);

    // [DEBUG] Monitor showStartScreen changes
    useEffect(() => {
        console.log('[App] showStartScreen changed to:', showStartScreen);
    }, [showStartScreen]);

    // Auth & Profile
    const {
        session,
        userProfile,
        showLoginModal,
        setShowLoginModal,
        fetchProfile,
        handleTapTapLogin,
        handleUpdateNickname,
        handleSignOut,
    } = useAppAuthProfile({ setToastMsg });

    // --- Refs for Wrappers ---
    const boardSizeRef = useRef(settings.boardSize);
    const gameTypeRef = useRef(settings.gameType);
    const onlineStatusRef = useRef<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const myColorRef = useRef<Player | null>(null);
    const executeMoveRef = useRef<(x: number, y: number, isRemote: boolean) => void>(() => {});
    const handlePassRef = useRef<(isRemote?: boolean) => void>(() => {});
    const resetGameRef = useRef<(keepOnline?: boolean, explicitSize?: number, shouldBroadcast?: boolean) => void>(() => {});

    // Online State
    const {
        showOnlineMenu,
        setShowOnlineMenu,
        isMatching,
        isCreatingRoom,
        isJoiningRoom,
        matchTime,
        matchBoardSize,
        onlineStatus,
        roomId,
        myColor,
        setMyColor,
        opponentProfile,
        sendData,
        cleanupOnline,
        startMatchmaking,
        createRoom,
        joinRoom,
        cancelMatchmaking,
    } = useOnlineMatch({
        settings,
        session,
        userProfile,
        boardSizeRef,
        gameTypeRef,
        currentPlayerRef: gameState.currentPlayerRef,
        myColorRef,
        resetGameRef,
        executeMoveRef,
        handlePassRef,
        setShowLoginModal,
        setShowMenu,
        setShowStartScreen,
        setToastMsg,
        vibrate,
    });
    const [showTerritory, setShowTerritory] = useState(false); // [New] Territory Toggle

    const {
        clearInitialStones,
        gameCopied,
        handleCopy,
        handleExportSGF,
        handleImport,
        importKey,
        setImportKey,
        setShowImportModal,
        showImportModal,
    } = useImportExportFlow({
        settings,
        gameState,
        exitTsumegoMode: (nextGameMode = 'PvP') => exitTsumegoMode(nextGameMode),
        playSfx,
        vibrate,
    });

    // About/Update
    const [showAboutModal, setShowAboutModal] = useState(false);

    // ELO Diff display
    const [eloDiffText, setEloDiffText] = useState<string | null>(null);
    const [eloDiffStyle, setEloDiffStyle] = useState<'gold' | 'normal' | 'negative' | null>(null);

    // Sync Refs
    useEffect(() => { boardSizeRef.current = settings.boardSize; }, [settings.boardSize]);
    useEffect(() => { gameTypeRef.current = settings.gameType; }, [settings.gameType]);
    useEffect(() => { onlineStatusRef.current = onlineStatus; }, [onlineStatus]);
    useEffect(() => { myColorRef.current = myColor; }, [myColor]);

    // Other Refs
    const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const aiTurnLock = useRef(false);
    const pendingEndGameRef = useRef(false); // [New] Waiting for KataGo endgame analysis
    // --- Achievements ---
    const {
        newUnlocked, clearNewUnlocked, checkEndGameAchievements, checkMoveAchievements, achievementsList, userAchievements
    } = useAchievements(session?.user?.id);

    // --- AI Error Handler ---
    const handleAiError = useCallback((err: string) => {
        console.error("AI Error:", err);
        aiTurnLock.current = false;
        setIsThinking(false);
        setToastMsg(`AI 出错: ${err}`);
        setTimeout(() => setToastMsg(null), 5000);
    }, []);

    // --- AI Engines ---
    const webAiEngine = useWebKataGo({
        boardSize: settings.boardSize,
        onAiMove: (x, y) => {
            setTimeout(() => {
                if (aiTurnLock.current && !gameState.gameOver) executeMove(x, y, false);
            }, 200);
        },
        onAiPass: () => handlePass(false),
        onAiResign: () => endGame(settings.userColor, 'AI 认为胜率过低，投子认输'),
        onAiError: handleAiError,
        onAnalysisComplete: (data) => {
            if (!pendingEndGameRef.current) return;
            pendingEndGameRef.current = false;
            console.log('[App] KataGo Endgame Analysis:', data);
            const komi = settings.boardSize === 9 ? 6.5 : 7.5;
            const finalBoard = gameState.boardRef.current;
            const cleanedBoard = data.ownership ? cleanBoardWithTerritory(finalBoard, data.ownership) : finalBoard;
            const score = data.ownership
                ? calculateModelScore(finalBoard, data.ownership, komi)
                : calculateScore(cleanedBoard, undefined, komi);
            const lead = score.black - score.white;
            gameState.setBoard(cleanedBoard);
            gameState.setFinalScore(score);
            setShowPassModal(false);
            if (lead > 0) {
                endGame('black', `AI判定：黑领先 ${lead.toFixed(1)} 目`);
            } else {
                endGame('white', `AI判定：白领先 ${Math.abs(lead).toFixed(1)} 目`);
            }
        }
    });

    const {
        isWorkerReady,
        isLoading: isWebLoading, // Legacy loading state (internal)
        isThinking: isWebThinking,
        aiWinRate: webWinRate,
        stopThinking: stopWebThinking,
        isInitializing: isWebInitializing, // New
        initStatus: webInitStatus, // New
        aiLead: webLead,
        aiTerritory: webTerritory,
        requestAnalysis // New
    } = webAiEngine;

    const {
        displayLead,
        displayTerritory,
        displayWinRate,
        hideOfflineLoading,
        isFirstRun,
        setHideOfflineLoading,
        showThinkingStatus,
    } = useGameFlow({
        settings,
        gameState,
        isThinking,
        setIsThinking,
        showStartScreen,
        showPassModal,
        aiTimerRef,
        aiTurnLock,
        webAi: {
            isWorkerReady,
            isWebLoading,
            isWebThinking,
            isWebInitializing,
            webWinRate,
            webLead,
            webTerritory,
            stopWebThinking,
            requestWebAiMove: webAiEngine.requestWebAiMove,
        },
    });

    const exitTsumegoMode = (nextGameMode: GameMode = 'PvP') => {
        if (settings.gameMode === 'Tsumego') {
            settings.setGameMode(nextGameMode);
        }
        setTsumegoRoot(null);
        setTsumegoCurrentNode(null);
        setShowTsumegoResult(false);
        setTsumegoInstruction(null);
        setShowTsumegoList(false);
        setShowTsumegoLevelSelector(false);
    };

    const {
        endGame,
        executeMove,
        handleIntersectionClick,
        handlePass,
        handleUndo,
        resetGame,
    } = useGameActions({
        aiTimerRef,
        aiTurnLock,
        boardSizeRef,
        checkEndGameAchievements,
        checkMoveAchievements,
        cleanupOnline,
        clearInitialStones,
        displayTerritory,
        fetchProfile,
        gameState,
        gameTypeRef,
        handleTsumegoMoveRef,
        isThinking,
        isWebThinking,
        isWorkerReady,
        myColor,
        myColorRef,
        onlineStatus,
        onlineStatusRef,
        opponentProfile,
        pendingEndGameRef,
        playSfx,
        requestAnalysis,
        sendData,
        session,
        setEloDiffStyle,
        setEloDiffText,
        setIsThinking,
        setMyColor,
        setShowMenu,
        setShowPassModal,
        settings,
        setTsumegoCurrentNode,
        setTsumegoInstruction,
        setTsumegoRoot,
        setShowTsumegoResult,
        stopWebThinking,
        tsumegoCurrentNode,
        userProfile,
        vibrate,
        webAiEngine,
    });
    resetGameRef.current = resetGame;

    // --- Tsumego Logic (extracted to useTsumego hook) ---
    const {
        startTsumego,
        handleSelectTsumegoSet,
        handleNextTsumego,
        handleRetryTsumego,
        handleTsumegoMove,
    } = useTsumego({
        state: {
            tsumegoRoot,
            tsumegoCurrentNode,
            tsumegoCategories,
            currentTsumegoLevel,
            showTsumegoResult,
        },
        setters: {
            setTsumegoRoot,
            setTsumegoCurrentNode,
            setTsumegoCollection,
            setTsumegoSetTitle,
            setShowTsumegoResult,
            setTsumegoIsCorrect,
            setTsumegoResultMsg,
            setTsumegoInstruction,
            setShowTsumegoLevelSelector,
            setCurrentTsumegoLevel,
            setCompletedLevelIds,
        },
        gameMode: settings.gameMode,
        userColor: settings.userColor,
        boardSize: settings.boardSize,
        currentPlayer: gameState.currentPlayer,
        gameOver: gameState.gameOver,
        boardRef: gameState.boardRef,
        currentPlayerRef: gameState.currentPlayerRef,
        setBoardSize: settings.setBoardSize,
        setBoard: gameState.setBoard,
        setCurrentPlayer: gameState.setCurrentPlayer,
        setLastMove: gameState.setLastMove,
        setGameMode: settings.setGameMode,
        setGameType: settings.setGameType,
        setUserColor: settings.setUserColor,
        resetGame,
        executeMove: (x, y, isRemote) => executeMoveRef.current(x, y, isRemote),
        setToastMsg,
        vibrate,
        playSfx,
    });

    // Keep ref in sync so executeMove can call handleTsumegoMove without circular dep
    handleTsumegoMoveRef.current = handleTsumegoMove;

    const {
        handleHint,
        handlePrevProblem,
        hasNextProblem,
        hasPrevProblem,
    } = useTsumegoNavigation({
        boardRef: gameState.boardRef,
        currentPlayer: gameState.currentPlayer,
        currentTsumegoLevel,
        getTsumegoFileList,
        handleTsumegoMove,
        playSfx,
        setBoard: gameState.setBoard,
        setCurrentPlayer: gameState.setCurrentPlayer,
        setCurrentTsumegoLevel,
        setLastMove: gameState.setLastMove,
        setToastMsg,
        startTsumego,
        tsumegoCategories,
        tsumegoCurrentNode,
    });

    const handleApplySettings = useApplySettingsFlow({
        aiTimerRef,
        aiTurnLock,
        exitTsumegoMode,
        resetGame,
        settings,
        setToastMsg,
        stopWebThinking,
        userProfile,
        vibrate,
        webAiEngine,
    });

    const { handleStartGame } = useStartGameFlow({
        settings,
        showStartScreen,
        setShowStartScreen,
        appMode: gameState.appMode,
        webAiEngine,
        gameTypeRef,
        resetGame,
        exitTsumegoMode,
        vibrate,
    });

    executeMoveRef.current = executeMove;
    handlePassRef.current = handlePass;

    return (
        <AppView
            vm={{
                achievementsList,
                aiTurnLock,
                cancelMatchmaking,
                createRoom,
                clearNewUnlocked,
                completedLevelIds,
                consecutivePasses: gameState.consecutivePasses,
                displayLead,
                displayTerritory,
                displayWinRate,
                eloDiffStyle,
                eloDiffText,
                exitTsumegoMode,
                gameCopied,
                gameState,
                gameTypeRef,
                handleApplySettings,
                handleCopy,
                handleExportSGF,
                handleHint,
                handleImport,
                handleIntersectionClick,
                handleNextTsumego,
                handlePass,
                handlePrevProblem,
                handleRetryTsumego,
                handleSelectTsumegoSet,
                handleSignOut,
                handleStartGame,
                handleTapTapLogin,
                handleUndo,
                handleUpdateNickname,
                hasNextProblem,
                hasPrevProblem,
                hideOfflineLoading,
                importKey,
                isFirstRun,
                isCreatingRoom,
                isJoiningRoom,
                isMatching,
                isWebInitializing,
                matchBoardSize,
                matchTime,
                myColor,
                newUnlocked,
                onlineStatus,
                roomId,
                resetGame,
                session,
                setCurrentTsumegoLevel,
                setHideOfflineLoading,
                setImportKey,
                setIsThinking,
                setShowAboutModal,
                setShowImportModal,
                setShowLoginModal,
                setShowMenu,
                setShowOnlineMenu,
                setShowSkinShop,
                setShowStartScreen,
                setShowTerritory,
                setShowTsumegoLevelSelector,
                setShowTsumegoList,
                setShowTsumegoResult,
                setShowTutorial,
                setShowUserPage,
                setToastMsg,
                setTsumegoCollection,
                settings,
                showAboutModal,
                showImportModal,
                showLoginModal,
                showMenu,
                showOnlineMenu,
                showSkinShop,
                showStartScreen,
                showTerritory,
                showThinkingStatus,
                showTsumegoLevelSelector,
                showTsumegoList,
                showTsumegoResult,
                showTutorial,
                showUserPage,
                startMatchmaking,
                joinRoom,
                startTsumego,
                stopWebThinking,
                toastMsg,
                tsumegoCollection,
                tsumegoIsCorrect,
                tsumegoResultMsg,
                tsumegoSetTitle,
                userAchievements,
                userProfile,
                vibrate,
                webAiEngine,
                webInitStatus,
            }}
        />
    );
};

export default App;
