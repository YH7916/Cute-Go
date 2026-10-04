import React, { useState, useEffect, useRef } from 'react';

// Hooks
import { useGameAiSession } from './hooks/useGameAiSession';
import { useCoachSession } from './hooks/useCoachSession';
import { useCoachSettings } from './hooks/useCoachSettings';
import { useGameReview } from './hooks/useGameReview';
import { useAppUiState } from './hooks/useAppUiState';
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
import { useTeachingWorkspace } from './hooks/useTeachingWorkspace';

// Utils
import { Player } from './types';

import { AppView } from './components/AppView';

const App: React.FC = () => {
    // --- Hooks ---
    const settings = useAppSettings();
    const gameState = useGameState(settings.boardSize);
    const coachSettings = useCoachSettings();
    const { playSfx, vibrate } = useAudio(settings.musicVolume, settings.hapticEnabled);

    const ui = useAppUiState(settings.skipStartScreen);
    const { showStartScreen, setShowStartScreen, showPassModal, setShowPassModal,
        showTerritory, setShowMenu, setToastMsg } = ui;

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
        onImported: () => {
            cancelAiSession(); coach.cancel(); teaching.close();
            settings.setCoachMode(false); setShowStartScreen(false);
        },
        playSfx,
        vibrate,
    });

    // ELO Diff display
    const [eloDiffText, setEloDiffText] = useState<string | null>(null);
    const [eloDiffStyle, setEloDiffStyle] = useState<'gold' | 'normal' | 'negative' | null>(null);

    // Sync Refs
    useEffect(() => { boardSizeRef.current = settings.boardSize; }, [settings.boardSize]);
    useEffect(() => { gameTypeRef.current = settings.gameType; }, [settings.gameType]);
    useEffect(() => { onlineStatusRef.current = onlineStatus; }, [onlineStatus]);
    useEffect(() => { myColorRef.current = myColor; }, [myColor]);

    // --- Achievements ---
    const {
        newUnlocked, clearNewUnlocked, checkEndGameAchievements, checkMoveAchievements, achievementsList, userAchievements
    } = useAchievements(session?.user?.id);

    const endGameRef = useRef<(winner: Player, reason: string, score?: { black: number; white: number }) => void>(() => {});
    const { webAiEngine, isThinking, setIsThinking, aiTimerRef, aiTurnLock, pendingEndGameRef, cancelAiSession, requestCoachAnalysis } = useGameAiSession({
        boardSize: settings.boardSize, gameState, executeMoveRef, handlePassRef, endGameRef, setToastMsg, setShowPassModal,
    });
    const ownerScopeId = session?.user?.id ? `account:${session.user.id}` : 'local:guest';
    const teaching = useTeachingWorkspace(ownerScopeId, gameState.readPosition(), gameState.appMode === 'review' && !showStartScreen);
    const review = useGameReview({ gameState, gameType: settings.gameType,
        showTerritory: showTerritory && !teaching.isOpen && !showStartScreen, engine: webAiEngine, ownerScopeId });

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
        showStartScreen: showStartScreen || teaching.isOpen,
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

    const coach = useCoachSession({
        playing: gameState.appMode === 'playing',
        active: settings.gameType === 'Go' && !showStartScreen && !teaching.isOpen && onlineStatus === 'disconnected'
            && (gameState.appMode === 'review' || (settings.coachMode && settings.gameMode === 'PvAI' && gameState.appMode === 'playing')),
        position: review.position, readPosition: review.readPosition, ownerScopeId,
        conversationRoot: gameState.history[0]?.board ?? gameState.board,
        userColor: settings.userColor, gameOver: gameState.gameOver, config: coachSettings.config,
        analyze: gameState.appMode === 'playing' && !gameState.gameOver ? requestCoachAnalysis : undefined,
    });

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
        isThinking,
        isWebThinking,
        isWorkerReady,
        myColor,
        myColorRef,
        onlineStatus,
        onlineStatusRef,
        onIllegalMove: coach.explainIllegalMove,
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
        stopWebThinking,
        userProfile,
        vibrate,
        webAiEngine,
    });
    resetGameRef.current = resetGame;
    endGameRef.current = endGame;

    const handleApplySettings = useApplySettingsFlow({
        aiTimerRef, aiTurnLock, resetGame, settings,
        setToastMsg, stopWebThinking, userProfile, vibrate, webAiEngine,
    });

    const { handleStartGame, handleStartCoach } = useStartGameFlow({
        settings, showStartScreen: showStartScreen || teaching.isOpen, setShowStartScreen, appMode: gameState.appMode,
        webAiEngine, gameTypeRef, resetGame, vibrate,
    });

    executeMoveRef.current = executeMove;
    handlePassRef.current = handlePass;

    return (
        <AppView
            vm={{
                ...ui,
                coach, coachSettings, review, teaching,
                handleStartCoach: () => { teaching.close(); coach.cancel(); handleStartCoach(); },
                handleOpenLearning: () => {
                    if (onlineStatus !== 'disconnected') { setToastMsg('请先结束联机对局，再进入围棋教学。'); return; }
                    cancelAiSession(); coach.cancel(); review.exitVariation(); ui.setShowTutorial(false); teaching.open();
                },
                handleInspectReview: position => { cancelAiSession(); coach.cancel(); review.inspectPosition(position); },
                handleEnterReview: () => {
                    cancelAiSession(); coach.cancel(); review.exitVariation();
                    gameState.setReviewIndex(gameState.readPosition().history.length); gameState.setAppMode('review');
                },
                handleSaveReview: () => {
                    const saved = teaching.savePosition(review.readPosition());
                    setToastMsg(saved ? '已收藏这个复盘局面。' : '暂时无法保存，请检查学习记录提示。');
                },
                handleReturnHome: () => {
                    cancelAiSession(); coach.cancel(); teaching.close();
                    settings.setCoachMode(false);
                    setShowStartScreen(true); vibrate(10);
                },
                viewPosition: review.position,
                achievementsList,
                aiTurnLock,
                cancelMatchmaking,
                createRoom,
                clearNewUnlocked,
                consecutivePasses: gameState.consecutivePasses,
                displayLead,
                displayTerritory: gameState.appMode === 'review' ? review.territory : displayTerritory,
                displayWinRate,
                eloDiffStyle,
                eloDiffText,
                gameCopied,
                gameState,
                gameTypeRef,
                handleApplySettings,
                handleCopy,
                handleExportSGF,
                handleImport,
                handleIntersectionClick: (x, y) => { if (!teaching.isActive()) handleIntersectionClick(x, y); },
                handlePass: async isRemote => { if (!teaching.isActive()) await handlePass(isRemote); },
                handleSignOut,
                handleStartGame: (...args) => { teaching.close(); coach.cancel(); handleStartGame(...args); },
                handleTapTapLogin,
                handleUndo: () => { if (!teaching.isActive()) handleUndo(); },
                handleUpdateNickname,
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
                resetGame: (...args) => { teaching.close(); resetGame(...args); },
                session,
                setHideOfflineLoading,
                setImportKey,
                setIsThinking,
                setShowImportModal,
                setShowLoginModal,
                setShowOnlineMenu,
                settings,
                showImportModal,
                showLoginModal,
                showOnlineMenu,
                showThinkingStatus,
                startMatchmaking,
                joinRoom,
                stopWebThinking,
                userAchievements,
                userProfile,
                vibrate,
                webInitStatus,
            }}
        />
    );
};

export default App;
