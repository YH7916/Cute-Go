import React from 'react';
import { Settings, User as UserIcon, Home, History } from 'lucide-react';
import { GameBoard } from './GameBoard';
import { ScoreBoard } from './ScoreBoard';
import { GameControls } from './GameControls';
import { PassConfirmationModal } from './PassConfirmationModal';
import { AnalysisPanel } from './AnalysisPanel';
import { CoachAssistant } from './CoachAssistant';
import { CoachMarkers } from './board/CoachMarkers';
import { LearningCenter } from './coach/LearningCenter';
import { AchievementNotification } from './AchievementNotification';
import { StartScreen } from './StartScreen';
import { TopBar } from './common/TopBar';
import { Button, Toast } from '../ui/common';
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
    gameState,
    viewPosition,
    gameTypeRef,
    handleIntersectionClick,
    handlePass,
    handleStartGame,
    handleUndo,
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
    setShowUserPage,
    setShowTerritory,
    settings,
    showStartScreen,
    showTerritory,
    showThinkingStatus,
    stopWebThinking,
    toastMsg,
    vibrate,
    webInitStatus,
  } = vm;
  if (vm.teaching.view.isOpen) return <LearningCenter {...vm.teaching.view} onClose={vm.handleReturnHome} onPractice={vm.handleStartCoach}
    tutorialContent={vm.teaching.tutorialContent}
    coachSkin={settings.coachSkin} appearance={{ stoneSkin: settings.stoneSkin, boardSkin: settings.boardSkin,
      stoneAnimationEnabled: settings.stoneAnimationEnabled, separatePieces: settings.separatePieces, vibrate }} />;
  const isFunGoMode = settings.gameType === 'Go' && settings.gameMode === 'PvAI' && settings.difficulty === 'Fun';
  const themeClass = settings.boardSkin === 'sakura_wood' ? 'theme-sakura' : '';
  const coachPoints = gameState.appMode === 'review' && (vm.review.error || vm.coach.error) ? [] : vm.coach.hintPoints;
  const scoreBoard = <ScoreBoard
    currentPlayer={viewPosition.currentPlayer}
    blackCaptures={viewPosition.blackCaptures}
    whiteCaptures={viewPosition.whiteCaptures}
    gameType={settings.gameType}
    isThinking={showThinkingStatus}
    stoneSkin={settings.stoneSkin}
    showWinRate={false}
    appMode={gameState.appMode}
    gameOver={gameState.gameOver}
    userColor={settings.userColor}
    displayWinRate={displayWinRate ?? 50}
  />;
  const gameControls = <GameControls
    appMode={gameState.appMode}
    setupTool={gameState.setupTool}
    setSetupTool={gameState.setSetupTool}
    finishSetup={() => {
      gameState.setAppMode('playing');
      gameState.writePosition(position => ({ ...position, history: [], consecutivePasses: 0 }));
      aiTurnLock.current = false;
      setIsThinking(false);
    }}
    reviewIndex={gameState.reviewIndex}
    history={gameState.history}
    setReviewIndex={index => { vm.coach.cancel(); vm.review.exitVariation(); gameState.setReviewIndex(index); }}
    handleUndo={handleUndo}
    handlePass={handlePass}
    resetGame={(keepOnline) => resetGame(keepOnline)}
    isThinking={showThinkingStatus}
    gameOver={gameState.gameOver}
    onlineStatus={onlineStatus}
    currentPlayer={gameState.currentPlayer}
    myColor={myColor}
    consecutivePasses={gameState.consecutivePasses}
    showTerritory={showTerritory}
    onToggleTerritory={() => setShowTerritory(!showTerritory)}
  />;
  const homeButton = <button aria-label="返回首页" onClick={vm.handleReturnHome} className="btn-retro btn-brown p-3 rounded-xl"><Home size={20} /></button>;
  const accountButtons = <>
    <button aria-label="个人中心" onClick={() => { setShowUserPage(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><UserIcon size={20} /></button>
    <button aria-label="设置" onClick={() => { setShowMenu(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
  </>;
  const topBar = <TopBar
    leftButtons={<>{homeButton}{accountButtons}</>}
    rightContent={<>
      <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide">
        {onlineStatus === 'connected' && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
        )}
        {gameState.appMode === 'setup' ? '电子挂盘' : gameState.appMode === 'review' ? '复盘模式' : vm.coach.active ? 'AI 陪练' : (settings.gameType === 'Go' ? '围棋' : '五子棋')}
      </span>
      {gameState.appMode === 'playing' && (
        <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086] mt-1">
          {settings.boardSize}路 • {settings.gameMode === 'PvP' ? '双人' : isFunGoMode ? '启蒙' : settings.difficulty} •
          <span className="ml-1">
            {onlineStatus === 'connected' ? '在线' : (settings.gameMode === 'PvAI' ? '本地 AI' : '本地')}
          </span>
        </span>
      )}
    </>}
  />;
  const analysisPanel = gameState.appMode === 'playing' && settings.gameMode === 'PvAI' && settings.showWinRate && settings.gameType === 'Go' && !isFunGoMode ? <AnalysisPanel
    winRate={displayWinRate ?? 50}
    lead={displayLead}
    isThinking={showThinkingStatus}
    showTerritory={showTerritory}
    onToggleTerritory={() => setShowTerritory((prev: boolean) => !prev)}
    userColor={settings.userColor}
  /> : null;
  const reviewEntry = vm.coach.active && gameState.appMode === 'playing' && settings.gameType === 'Go'
      && onlineStatus === 'disconnected' && gameState.history.length > 0
    ? <Button appearance="retro" variant="secondary" size="sm"
      className="h-11 w-11 shrink-0 px-0 flex items-center justify-center"
      aria-label="回看棋谱" title="回看棋谱" onClick={vm.handleEnterReview}>
      <History size={18} aria-hidden="true" />
    </Button> : undefined;

  return (
    <div className={`${themeClass} ${vm.coach.active ? 'coach-layout' : ''} h-full w-full bg-[#f7e7ce] flex flex-col landscape:flex-row items-center relative select-none overflow-y-auto landscape:overflow-hidden text-[#5c4033] pb-safe`}>
      <Toast message={toastMsg} />

      {showStartScreen && (
        <StartScreen
          onStartGame={handleStartGame}
          onStartCoach={vm.handleStartCoach}
          onOpenLearning={vm.handleOpenLearning}
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
            settings.setCoachMode(false);
            setShowStartScreen(false);
            settings.setGameMode('PvP');
            resetGame(false);
            gameState.setAppMode('setup');
          }}
          onOpenUserPage={() => setShowUserPage(true)}
          onOpenSkinShop={() => setShowSkinShop(true)}
        />
      )}

      <AchievementNotification newUnlocked={newUnlocked} clearNewUnlocked={clearNewUnlocked} />

      <div className="game-board-area relative flex-grow h-[60%] landscape:h-full w-full landscape:w-auto landscape:flex-1 flex items-center justify-center p-2 order-2 landscape:order-1 min-h-0 min-w-0">
        <div className="board-viewport w-full h-full max-w-full max-h-full aspect-square flex items-center justify-center">
          <div className="transform transition-transform w-full h-full relative">
            <GameBoard
              board={viewPosition.board}
              onIntersectionClick={vm.review.inVariation ? vm.review.playVariation : handleIntersectionClick}
              vibrate={vibrate}
              onInspectPoint={vm.coach.active ? (x, y) => vm.coach.explainIllegalMove({ x, y }, vm.review.readPosition()) : undefined}
              currentPlayer={viewPosition.currentPlayer}
              lastMove={viewPosition.lastMove}
              showQi={settings.showQi}
              gameType={settings.gameType}
              gameMode={settings.gameMode}
              showCoordinates={settings.showCoordinates || vm.coach.active}
              stoneAnimationEnabled={settings.stoneAnimationEnabled}
              extraSVG={vm.coach.active ? <CoachMarkers points={coachPoints} board={viewPosition.board} /> : undefined}
              markedPoints={vm.coach.active ? coachPoints : undefined}
              extraSVGLayer="foreground"
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

      <div className="game-sidebar w-full landscape:w-96 flex flex-col gap-4 pb-4 z-20 shrink-0 bg-[#f7e7ce] landscape:bg-[#f2e6d6] landscape:h-full landscape:overflow-y-auto landscape:border-l-4 landscape:border-[#e3c086] order-1 landscape:order-2 shadow-xl landscape:shadow-none">
        {topBar}

        <div className="game-actions flex flex-col gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {scoreBoard}
            </div>
          </div>

          {analysisPanel}

          {gameControls}
        </div>
      </div>

      {vm.coach.active && <CoachAssistant coach={vm.coach} coachSkin={settings.coachSkin} gameOver={gameState.gameOver}
        onInspectPosition={vm.handleInspectReview}
        review={gameState.appMode === 'review' ? vm.review : undefined}
        reviewAction={reviewEntry} />}
      <AppModals vm={vm} />
    </div>
  );
};
