import React from 'react';
import { Settings, User as UserIcon, Home } from 'lucide-react';
import { GameBoard } from './GameBoard';
import { ScoreBoard } from './ScoreBoard';
import { GameControls } from './GameControls';
import { PassConfirmationModal } from './PassConfirmationModal';
import { AnalysisPanel } from './AnalysisPanel';
import { AchievementNotification } from './AchievementNotification';
import { StartScreen } from './StartScreen';
import { TopBar } from './common/TopBar';
import { Toast } from '../ui/common';
import { AppModals } from './app/AppModals';
import type { AppViewModel } from './app/AppViewModel';

interface AppViewProps {
  vm: AppViewModel;
}

export const AppView: React.FC<AppViewProps> = ({ vm }) => {
  const {
    aiTurnLock,
    clearNewUnlocked,
    consecutivePasses,
    displayLead,
    displayTerritory,
    displayWinRate,
    exitTsumegoMode,
    gameState,
    gameTypeRef,
    handleHint,
    handleIntersectionClick,
    handleNextTsumego,
    handlePass,
    handlePrevProblem,
    handleStartGame,
    handleUndo,
    hasNextProblem,
    hasPrevProblem,
    myColor,
    newUnlocked,
    onlineStatus,
    resetGame,
    setIsThinking,
    setShowAboutModal,
    setShowImportModal,
    setShowMenu,
    setShowOnlineMenu,
    setShowSkinShop,
    setShowStartScreen,
    setShowTsumegoLevelSelector,
    setShowTutorial,
    setShowUserPage,
    setShowTerritory,
    settings,
    showStartScreen,
    showTerritory,
    showThinkingStatus,
    stopWebThinking,
    toastMsg,
    vibrate,
    webAiEngine,
    webInitStatus,
  } = vm;
  const isFunGoMode = settings.gameType === 'Go' && settings.gameMode === 'PvAI' && settings.difficulty === 'Fun';
  const themeClass = settings.boardSkin === 'sakura_wood' ? 'theme-sakura' : '';

  return (
    <div className={`${themeClass} h-full w-full bg-[#f7e7ce] flex flex-col landscape:flex-row items-center relative select-none overflow-y-auto landscape:overflow-hidden text-[#5c4033] pb-safe`}>
      <Toast message={toastMsg} />

      {showStartScreen && (
        <StartScreen
          onStartGame={handleStartGame}
          onOpenTsumego={() => setShowTsumegoLevelSelector(true)}
          onOpenTutorial={() => setShowTutorial(true)}
          onOpenOnline={() => setShowOnlineMenu(true)}
          onOpenImport={() => setShowImportModal(true)}
          onOpenSettings={(gameType) => {
            if (gameType) {
              settings.setGameType(gameType);
              gameTypeRef.current = gameType;
            }
            setShowMenu(true);
          }}
          onOpenAbout={() => setShowAboutModal(true)}
          onStartSetup={() => {
            setShowStartScreen(false);
            exitTsumegoMode('PvP');
            resetGame(false);
            gameState.setAppMode('setup');
          }}
          onOpenUserPage={() => setShowUserPage(true)}
          onOpenSkinShop={() => setShowSkinShop(true)}
        />
      )}

      <AchievementNotification newUnlocked={newUnlocked} clearNewUnlocked={clearNewUnlocked} />

      <div className="relative flex-grow h-[60%] landscape:h-full w-full landscape:w-auto landscape:flex-1 flex items-center justify-center p-2 order-2 landscape:order-1 min-h-0 min-w-0">
        <div className="w-full h-full max-w-full max-h-full aspect-square flex items-center justify-center">
          <div className="transform transition-transform w-full h-full relative">
            <GameBoard
              board={gameState.appMode === 'review' && gameState.history[gameState.reviewIndex] ? gameState.history[gameState.reviewIndex].board : gameState.board}
              onIntersectionClick={handleIntersectionClick}
              currentPlayer={gameState.currentPlayer}
              lastMove={gameState.appMode === 'review' && gameState.history[gameState.reviewIndex] ? gameState.history[gameState.reviewIndex].lastMove : gameState.lastMove}
              showQi={settings.showQi}
              gameType={settings.gameType}
              gameMode={settings.gameMode}
              showCoordinates={settings.showCoordinates}
              territory={displayTerritory}
              showTerritory={showTerritory}
              stoneSkin={settings.stoneSkin}
              boardSkin={settings.boardSkin}
              separatePieces={settings.separatePieces}
            />
          </div>
        </div>
        {(showThinkingStatus || webInitStatus) && (
          <div className="absolute top-4 left-4 bg-white/80 px-4 py-2 rounded-full text-xs font-bold text-[#5c4033] animate-pulse border-2 border-[#e3c086] shadow-sm z-20">
            {webInitStatus ? webInitStatus : 'AI 正在思考...'}
          </div>
        )}
        <PassConfirmationModal
          consecutivePasses={consecutivePasses}
          gameOver={gameState.gameOver}
          passNotificationDismissed={gameState.passNotificationDismissed}
          onDismiss={() => {
            gameState.setPassNotificationDismissed(true);
            setIsThinking(false);
            stopWebThinking();
            aiTurnLock.current = false;
          }}
          onPass={() => handlePass(false)}
        />
      </div>

      <div className="w-full landscape:w-96 flex flex-col gap-4 pb-4 z-20 shrink-0 bg-[#f7e7ce] landscape:bg-[#f2e6d6] landscape:h-full landscape:border-l-4 landscape:border-[#e3c086] order-1 landscape:order-2 shadow-xl landscape:shadow-none">
        <TopBar
          leftButtons={<>
            <button onClick={() => { exitTsumegoMode('PvP'); setShowStartScreen(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Home size={20} /></button>
            <button onClick={() => { setShowUserPage(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><UserIcon size={20} /></button>
            <button onClick={() => { setShowMenu(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
          </>}
          rightContent={<>
            <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide">
              {onlineStatus === 'connected' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
              {gameState.appMode === 'setup' ? '电子挂盘' : gameState.appMode === 'review' ? '复盘模式' : (settings.gameType === 'Go' ? '围棋' : '五子棋')}
            </span>
            {gameState.appMode === 'playing' && (
              <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086] mt-1">
                {settings.boardSize}路 • {settings.gameMode === 'PvP' ? '双人' : isFunGoMode ? '娱乐' : settings.difficulty} •
                <span className="ml-1">
                  {onlineStatus === 'connected' ? '在线' : (settings.gameMode === 'PvAI' ? (isFunGoMode ? '手写 AI' : '本地 AI') : '本地')}
                </span>
              </span>
            )}
          </>}
        />

        <div className="flex flex-col gap-4 px-4">
          <ScoreBoard
            currentPlayer={gameState.currentPlayer}
            blackCaptures={gameState.blackCaptures}
            whiteCaptures={gameState.whiteCaptures}
            gameType={settings.gameType}
            isThinking={showThinkingStatus}
            showWinRate={false}
            appMode={gameState.appMode}
            gameOver={gameState.gameOver}
            userColor={settings.userColor}
            displayWinRate={displayWinRate ?? 50}
          />

          {gameState.appMode === 'playing' && settings.gameMode === 'PvAI' && settings.showWinRate && settings.gameType === 'Go' && !isFunGoMode && (
            <AnalysisPanel
              winRate={displayWinRate ?? 50}
              lead={displayLead}
              isThinking={showThinkingStatus}
              showTerritory={showTerritory}
              onToggleTerritory={() => setShowTerritory((prev: boolean) => !prev)}
              userColor={settings.userColor}
            />
          )}

          <GameControls
            appMode={gameState.appMode}
            setupTool={gameState.setupTool}
            setSetupTool={gameState.setSetupTool}
            finishSetup={() => {
              gameState.setAppMode('playing');
              gameState.setHistory([]);
              gameState.historyRef.current = [];
              aiTurnLock.current = false;
              setIsThinking(false);
            }}
            reviewIndex={gameState.reviewIndex}
            history={gameState.history}
            setReviewIndex={gameState.setReviewIndex}
            setAppMode={gameState.setAppMode}
            setGameOver={gameState.setGameOver}
            handleUndo={handleUndo}
            handlePass={handlePass}
            resetGame={(keepOnline) => resetGame(keepOnline)}
            isThinking={showThinkingStatus}
            gameOver={gameState.gameOver}
            onlineStatus={onlineStatus}
            currentPlayer={gameState.currentPlayer}
            myColor={myColor}
            consecutivePasses={gameState.consecutivePasses}
            isTsumego={settings.gameMode === 'Tsumego'}
            hasPrevProblem={hasPrevProblem}
            hasNextProblem={hasNextProblem}
            handlePrevProblem={handlePrevProblem}
            handleNextProblem={handleNextTsumego}
            handleHint={handleHint}
            showTerritory={showTerritory}
            onToggleTerritory={() => {
              const nextState = !showTerritory;
              setShowTerritory(nextState);
              if (nextState && gameState.appMode === 'review') {
                const historySlice = gameState.history.slice(0, gameState.reviewIndex + 1);
                const currentItem = gameState.history[gameState.reviewIndex];
                const boardToAnalyze = currentItem ? currentItem.board : gameState.board;
                const playerToAnalyze = currentItem
                  ? (currentItem.currentPlayer === 'black' ? 'white' : 'black')
                  : gameState.currentPlayer;

                webAiEngine.requestAnalysis(boardToAnalyze, playerToAnalyze, historySlice, 7.5, settings.gameType);
              }
            }}
          />
        </div>
      </div>

      <AppModals vm={vm} />
    </div>
  );
};
