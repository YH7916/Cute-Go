import React, { useMemo } from 'react';
import { SettingsModal } from '../SettingsModal';
import { CoachSettings } from '../CoachSettings';
import { UserPage } from '../UserPage';
import { OnlineMenu } from '../OnlineMenu';
import { ImportExportModal } from '../ImportExportModal';
import { EndGameModal } from '../EndGameModal';
import { TutorialModal } from '../TutorialModal';
import { OfflineLoadingModal } from '../OfflineLoadingModal';
import { LoginModal } from '../LoginModal';
import { AboutModal } from '../AboutModal';
import { SkinShopModal } from '../SkinShopModal';
import { platform } from '../../services/platform';
import type { AppViewModel } from './AppViewModel';

interface AppModalsProps {
  vm: AppViewModel;
}

export const AppModals: React.FC<AppModalsProps> = ({ vm }) => {
  const {
    achievementsList,
    cancelMatchmaking,
    createRoom,
    eloDiffStyle,
    eloDiffText,
    gameCopied,
    gameState,
    handleApplySettings,
    handleCopy,
    handleExportSGF,
    handleImport,
    handleSignOut,
    handleTapTapLogin,
    handleUpdateNickname,
    hideOfflineLoading,
    importKey,
    isCreatingRoom,
    isFirstRun,
    isJoiningRoom,
    isMatching,
    joinRoom,
    isWebInitializing,
    matchBoardSize,
    matchTime,
    onlineStatus,
    roomId,
    resetGame,
    session,
    setHideOfflineLoading,
    setImportKey,
    setShowAboutModal,
    setShowImportModal,
    setShowLoginModal,
    setShowMenu,
    setShowOnlineMenu,
    setShowSkinShop,
    setShowTutorial,
    setShowUserPage,
    settings,
    showAboutModal,
    showImportModal,
    showLoginModal,
    showMenu,
    showOnlineMenu,
    showSkinShop,
    showTutorial,
    showUserPage,
    startMatchmaking,
    userAchievements,
    userProfile,
    vibrate,
  } = vm;

  const currentGameSettings = useMemo(() => ({
    boardSize: settings.boardSize,
    gameType: settings.gameType,
    gameMode: settings.gameMode,
    difficulty: settings.difficulty,
    userColor: settings.userColor,
  }), [settings.boardSize, settings.gameType, settings.gameMode, settings.difficulty, settings.userColor]);

  return (
    <>
      <TutorialModal tutorialContent={vm.teaching?.tutorialContent} isOpen={showTutorial} onClose={() => {
        setShowTutorial(false); localStorage.setItem('cute_go_tutorial_seen', 'true');
      }} onExplore={destination => {
        if (destination === 'learning') vm.handleOpenLearning();
        else if (destination === 'coach') vm.handleStartCoach();
        else if (destination === 'local') vm.handleStartGame('PvP', undefined, 'Go');
        else if (destination === 'ai') vm.handleStartGame('PvAI', 'local', 'Go');
        else setShowOnlineMenu(true);
      }} stoneAnimationEnabled={settings.stoneAnimationEnabled} vibrate={vibrate} />
      <SettingsModal
        coachMode={settings.coachMode}
        coachSettings={<CoachSettings value={vm.coachSettings.config} rememberKey={vm.coachSettings.rememberKey}
          onSave={vm.coachSettings.saveConfig} onClearKey={vm.coachSettings.clearKey} storageError={vm.coachSettings.storageError} />}
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        currentGameSettings={currentGameSettings}
        onApplyGameSettings={handleApplySettings}
        showQi={settings.showQi} setShowQi={settings.setShowQi}
        showWinRate={settings.showWinRate} setShowWinRate={settings.setShowWinRate}
        showCoordinates={settings.showCoordinates} setShowCoordinates={settings.setShowCoordinates}
        stoneAnimationEnabled={settings.stoneAnimationEnabled} setStoneAnimationEnabled={settings.setStoneAnimationEnabled}
        musicVolume={settings.musicVolume} setMusicVolume={settings.setMusicVolume}
        hapticEnabled={settings.hapticEnabled} setHapticEnabled={settings.setHapticEnabled}
        vibrate={vibrate}
        skipStartScreen={settings.skipStartScreen} setSkipStartScreen={settings.setSkipStartScreen}
        onStartSetup={() => { settings.setCoachMode(false); settings.setGameMode('PvP'); resetGame(false); gameState.setAppMode('setup'); setShowMenu(false); }}
        onOpenImport={() => { setShowImportModal(true); setShowMenu(false); }}
        onOpenTutorial={() => { setShowTutorial(true); setShowMenu(false); }}
        onOpenOnline={() => setShowOnlineMenu(true)}
        onOpenAbout={() => { setShowAboutModal(true); setShowMenu(false); }}
        onOpenSkinShop={() => setShowSkinShop(true)}
        separatePieces={settings.separatePieces}
        setSeparatePieces={settings.setSeparatePieces}
      />

      <SkinShopModal
        isOpen={showSkinShop}
        onClose={() => setShowSkinShop(false)}
        currentBoardSkin={settings.boardSkin}
        currentStoneSkin={settings.stoneSkin}
        currentCoachSkin={settings.coachSkin}
        onSetBoardSkin={settings.setBoardSkin}
        onSetStoneSkin={settings.setStoneSkin}
        onSetCoachSkin={settings.setCoachSkin}
      />

      <UserPage
        isOpen={showUserPage}
        onClose={() => setShowUserPage(false)}
        session={session}
        userProfile={userProfile}
        achievementsList={achievementsList}
        userAchievements={userAchievements}
        onLoginClick={() => { setShowLoginModal(true); setShowUserPage(false); }}
        onSignOutClick={handleSignOut}
        onTapTapLeaderboardClick={() => {
          platform.leaderboard.openEloLeaderboard();
        }}
        onUpdateNickname={handleUpdateNickname}
      />

      <OnlineMenu
        isOpen={showOnlineMenu}
        onClose={() => setShowOnlineMenu(false)}
        isMatching={isMatching}
        onCancelMatch={cancelMatchmaking}
        onStartMatch={startMatchmaking}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        matchBoardSize={matchBoardSize}
        matchTime={matchTime}
        onlineStatus={onlineStatus}
        roomId={roomId}
        isCreatingRoom={isCreatingRoom}
        isJoiningRoom={isJoiningRoom}
      />

      <ImportExportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        importKey={importKey}
        setImportKey={setImportKey}
        onImport={handleImport}
        onCopy={handleCopy}
        onExportSGF={handleExportSGF}
        isCopied={gameCopied}
      />

      <EndGameModal
        isOpen={gameState.gameOver && gameState.appMode === 'playing' && !showMenu}
        winner={gameState.winner}
        winReason={gameState.winReason}
        eloDiffText={eloDiffText}
        eloDiffStyle={eloDiffStyle}
        finalScore={gameState.finalScore}
        onRestart={() => resetGame(true)}
        onReview={vm.handleEnterReview}
      />

      <OfflineLoadingModal
        isInitializing={isWebInitializing && !hideOfflineLoading}
        isFirstRun={isFirstRun}
        onClose={() => { setHideOfflineLoading(true); localStorage.setItem('has_run_ai_before', 'true'); }}
      />

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onTapTapLogin={handleTapTapLogin}
      />

      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        vibrate={vibrate}
      />

    </>
  );
};
